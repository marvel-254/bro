-- ---------------------------------------------------------------------------
-- Message requests
--
-- A first DM from someone you are not friends with is a request, not a normal
-- conversation. The recipient can accept, decline, block or report it before
-- any presence, typing or read state is exposed.
--
-- The state lives on the conversation (`requested` -> `accepted`/`declined`)
-- instead of a separate table because messages already belong to a
-- conversation: a request is the same object with fewer permissions, and
-- accepting it must not move history between rows.
--
-- Enforcement:
--   * create_direct_conversation decides status from an accepted friendship;
--   * can_send_in_conversation allows exactly one message until accepted;
--   * attachments are refused while a request is pending;
--   * read cursors are not shared for pending/declined conversations.
-- ---------------------------------------------------------------------------

alter table public.conversations
  add column if not exists status text not null default 'accepted'
    check (status in ('accepted', 'requested', 'declined'));

alter table public.conversations
  add column if not exists requested_by uuid
    references public.profiles (id) on delete set null;

comment on column public.conversations.status is
  'accepted = normal conversation; requested/declined = first-DM request flow.';
comment on column public.conversations.requested_by is
  'Who sent the pending request. Null for accepted conversations.';

create index if not exists conversations_status_idx
  on public.conversations (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Opening a direct conversation
--
-- Friends get a normal thread. Anyone else gets a request, and re-opening the
-- same pair returns the existing row so a declined request cannot be reset by
-- calling this again.
-- ---------------------------------------------------------------------------

create or replace function public.create_direct_conversation(peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  existing uuid;
  created uuid;
  are_friends boolean;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  if peer_id is null or peer_id = caller then
    raise exception 'cannot open a conversation with yourself'
      using errcode = '22023';
  end if;

  if public.blocks_between(caller, peer_id) then
    raise exception 'cannot open: a block exists between these users'
      using errcode = 'P0001';
  end if;

  select c.id into existing
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = caller
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = peer_id
  where c.type = 'direct'
  limit 1;

  if existing is not null then
    return existing;
  end if;

  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and (
        (f.requester_id = caller and f.addressee_id = peer_id)
        or (f.requester_id = peer_id and f.addressee_id = caller)
      )
  ) into are_friends;

  insert into public.conversations (type, created_by, status, requested_by)
  values (
    'direct',
    caller,
    case when are_friends then 'accepted' else 'requested' end,
    case when are_friends then null else caller end
  )
  returning id into created;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (created, caller, 'admin'), (created, peer_id, 'member');

  return created;
end;
$$;

revoke all on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Sending
--
-- One text message is the whole budget of a pending request. The helper is
-- security definer because a policy on messages cannot safely query messages
-- under RLS; it would recurse.
-- ---------------------------------------------------------------------------

create or replace function public.can_send_in_conversation(
  p_conversation_id uuid,
  p_sender_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and (
        c.status = 'accepted'
        or (
          c.status = 'requested'
          and c.requested_by = p_sender_id
          and not exists (
            select 1
            from public.messages m
            where m.conversation_id = p_conversation_id
              and m.sender_id = p_sender_id
          )
        )
      )
  );
$$;

revoke all on function public.can_send_in_conversation(uuid, uuid) from public;
grant execute on function public.can_send_in_conversation(uuid, uuid) to authenticated;

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.is_conversation_member(conversation_id)
    and sender_id = auth.uid()
    and not public.blocks_between(sender_id, auth.uid())
    and public.can_send_in_conversation(conversation_id, sender_id)
    and (
      gif_id is null
      or exists (
        select 1 from public.gif_library g
        where g.id = gif_id and g.is_listed
      )
    )
  );

-- Attachments are never part of the first request message. Blocking the link
-- (not the upload) keeps the storage flow untouched while refusing to deliver
-- media in a request.
create or replace function public.reject_request_attachment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message_id is not null and exists (
    select 1
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where m.id = new.message_id
      and c.status in ('requested', 'declined')
  ) then
    raise exception 'attachments are not allowed in a message request'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists attachments_reject_request on public.attachments;
create trigger attachments_reject_request
  before insert or update of message_id on public.attachments
  for each row
  execute function public.reject_request_attachment();

-- ---------------------------------------------------------------------------
-- Accept / decline
--
-- Only the recipient can move a pending request. Accepting makes it an
-- ordinary conversation; declining leaves it visible to the sender as
-- "declined" but removes it from the recipient's request list.
-- ---------------------------------------------------------------------------

create or replace function public.accept_message_request(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into conv from public.conversations where id = p_conversation_id;
  if conv.id is null or conv.status <> 'requested' then
    raise exception 'no pending message request' using errcode = 'P0001';
  end if;
  if conv.requested_by = auth.uid() then
    raise exception 'you cannot accept your own request' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this conversation' using errcode = 'P0001';
  end if;

  update public.conversations
  set status = 'accepted'
  where id = p_conversation_id;
end;
$$;

create or replace function public.decline_message_request(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conv public.conversations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  select * into conv from public.conversations where id = p_conversation_id;
  if conv.id is null or conv.status <> 'requested' then
    raise exception 'no pending message request' using errcode = 'P0001';
  end if;
  if conv.requested_by = auth.uid() then
    raise exception 'you cannot decline your own request' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    raise exception 'not a member of this conversation' using errcode = 'P0001';
  end if;

  update public.conversations
  set status = 'declined'
  where id = p_conversation_id;
end;
$$;

revoke all on function public.accept_message_request(uuid) from public;
revoke all on function public.decline_message_request(uuid) from public;
grant execute on function public.accept_message_request(uuid) to authenticated;
grant execute on function public.decline_message_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- No read receipts while a request is pending or declined.
--
-- The caller keeps their own cursor for local unread state; peers see nothing
-- unless the conversation was accepted.
-- ---------------------------------------------------------------------------

create or replace function public.conversation_read_cursors(
  p_conversation_id uuid
)
returns table (user_id uuid, last_read_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select m.user_id, m.last_read_at
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  join public.conversations c on c.id = m.conversation_id
  where m.conversation_id = p_conversation_id
    and public.is_conversation_member(p_conversation_id)
    and (
      m.user_id = auth.uid()
      or (c.status = 'accepted' and p.share_read_receipts)
    );
$$;

-- Marking read only moves a cursor in a real conversation. A pending request
-- is inspected from the request list, so there is nothing to mark until the
-- recipient accepts.
create or replace function public.mark_conversation_read(
  p_conversation_id uuid,
  p_read_at timestamptz
)
returns timestamptz
language sql
security invoker
set search_path = public
as $$
  update public.conversation_members
  set last_read_at = greatest(
    coalesce(last_read_at, '-infinity'::timestamptz),
    least(p_read_at, now())
  )
  where conversation_id = p_conversation_id
    and user_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = p_conversation_id and c.status = 'accepted'
    )
  returning last_read_at;
$$;

-- ---------------------------------------------------------------------------
-- Reports
--
-- Minimal foundation: a report is stored and visible to the reporter only.
-- Moderator tooling can read it with the service role later.
-- ---------------------------------------------------------------------------

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reported_user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 100),
  details text,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_user_id)
);

alter table public.user_reports enable row level security;

drop policy if exists user_reports_insert on public.user_reports;
create policy user_reports_insert on public.user_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists user_reports_select on public.user_reports;
create policy user_reports_select on public.user_reports
  for select using (reporter_id = auth.uid());
