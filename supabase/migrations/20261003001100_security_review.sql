-- BRO — security review remediation
--
-- Addresses the exploitable findings from docs/code_review.md. Each section
-- names the finding it closes. Nothing here changes intended product behaviour;
-- it removes ways to do things nobody was ever supposed to be able to do.
--
-- Order inside this file matters: constraints are added after the cleanup
-- deletes that make them satisfiable.

-- ---------------------------------------------------------------------------
-- 1. EXECUTE grants (review finding 3)
--
-- Supabase grants EXECUTE on new functions to anon and authenticated by
-- default. Only search_messages ever needed a client grant. The rest are
-- trigger bodies (invoked by the system, no grant needed) or maintenance
-- functions nobody calls yet.
--
-- The is_* membership helpers are the exception: RLS policy evaluation DOES
-- require EXECUTE, including for anon queries that should return [] rather
-- than error. They leak nothing (booleans about the caller), so they stay
-- open to everyone.
-- ---------------------------------------------------------------------------

-- Helpers: needed by RLS evaluation for every role. Leave open.
-- is_conversation_member, is_space_member, is_conversation_admin: no change.

-- search_messages: already correct (authenticated only). Restated, not changed.
grant execute on function public.search_messages(text, int) to authenticated;
revoke execute on function public.search_messages(text, int) from anon;

-- Everything else: triggers and maintenance. Nobody calls these directly.
do $$
declare
  f text;
begin
  foreach f in array array[
    'handle_new_user',
    'scrub_deleted_messages',
    'fan_out_activity_notification',
    'sync_branch_counters',
    'record_message_activity',
    'record_reaction_activity',
    'record_space_join_activity',
    'prune_old_activity',
    'clear_friendships_on_block',
    'reject_blocked_friend_request',
    'touch_friendship_updated_at',
    'record_missed_call_activity',
    'sweep_orphan_media'
  ]
  loop
    -- Signatures differ (prune_old_activity takes no arguments), so resolve
    -- the oid dynamically instead of naming argument lists.
    execute format(
      'revoke execute on function public.%I from anon, authenticated, public',
      f
    );
    execute format(
      'grant execute on function public.%I to service_role',
      f
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Direct conversations via RPC (review finding 1)
--
-- conversation_members_insert let a conversation creator insert ANY user_id,
-- which grants the victim read access to the conversation, its messages,
-- branches, reactions and attachments. No invite, no consent.
--
-- Peer addition now happens inside this definer function, which resolves both
-- parties from auth.uid() and the existing membership rows. The policy below
-- is narrowed to self-only.
-- ---------------------------------------------------------------------------

create or replace function public.create_direct_conversation(peer_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  self_id uuid := auth.uid();
  existing uuid;
  new_id uuid;
begin
  if self_id is null then
    raise exception 'not signed in' using errcode = 'P0001';
  end if;

  if peer_id = self_id then
    raise exception 'cannot converse with yourself' using errcode = 'P0001';
  end if;

  -- Reuse an existing direct conversation shared by both users.
  select cm1.conversation_id into existing
  from public.conversation_members cm1
  join public.conversation_members cm2
    on cm2.conversation_id = cm1.conversation_id
   and cm2.user_id = peer_id
  join public.conversations c
    on c.id = cm1.conversation_id
   and c.type = 'direct'
  where cm1.user_id = self_id
  limit 1;

  if existing is not null then
    return existing;
  end if;

  insert into public.conversations (type, created_by)
  values ('direct', self_id)
  returning id into new_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (new_id, self_id, 'admin'), (new_id, peer_id, 'member');

  return new_id;
end;
$$;

grant execute on function public.create_direct_conversation(uuid) to authenticated;
revoke execute on function public.create_direct_conversation(uuid) from anon;

drop policy if exists conversation_members_insert on public.conversation_members;
create policy conversation_members_insert on public.conversation_members
  for insert with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Activity integrity (review finding 5)
--
-- Two holes: activity_insert let any signed-in user point an event at any
-- victim (the definer fan-out then dutifully notified them — unlimited
-- "X followed you" spam), and the dedup the old comment relied on did not
-- exist (notifications has id as its sole PK, so every ON CONFLICT DO NOTHING
-- silently inserted).
-- ---------------------------------------------------------------------------

-- One notification per (event, recipient), actually enforced this time.
-- (ADD CONSTRAINT has no IF NOT EXISTS on Postgres 15, so guard it manually.)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notifications_activity_user_key'
  ) then
    alter table public.notifications
      add constraint notifications_activity_user_key
      unique (activity_id, user_id);
  end if;
end $$;

-- Trigger-only writers from here on. All real events (replies, mentions,
-- reactions, joins, missed calls) are derived by migration 004/006 triggers;
-- recordActivity() in the client has zero callers and is removed alongside.
drop policy if exists activity_insert on public.activity;

-- ---------------------------------------------------------------------------
-- 4. is_verified (review finding 4)
--
-- profiles_update_self constrained the row, not the columns, so any user could
-- PATCH is_verified=true on themselves (plus presence/presence_text for
-- impersonation theatre). The column was also redundant: the client already
-- derives verification from auth.users.email_confirmed_at and never reads the
-- column. Drop it instead of guarding it.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

alter table public.profiles drop column if exists is_verified;

-- ---------------------------------------------------------------------------
-- 5. Update policies with missing WITH CHECK (review: medium RLS items)
-- ---------------------------------------------------------------------------

-- space_members_update: mirror the USING gate so a row cannot be moved out
-- from under it.
drop policy if exists space_members_update on public.space_members;
create policy space_members_update on public.space_members
  for update using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_id = auth.uid()
    )
  );

-- branches_update: a member may edit branch metadata, but may not repoint the
-- branch at a conversation they do not belong to.
drop policy if exists branches_update on public.conversation_branches;
create policy branches_update on public.conversation_branches
  for update using (public.is_conversation_member(conversation_id))
  with check (public.is_conversation_member(conversation_id));

-- invites_update: counters stay sane. consumeInvite increments uses; nothing
-- legitimate ever needs uses beyond max_uses or a negative counter.
drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update using (public.is_conversation_admin(conversation_id))
  with check (
    public.is_conversation_admin(conversation_id)
    and coalesce(uses, 0) >= 0
    and (max_uses is null or coalesce(uses, 0) <= max_uses)
  );

-- ---------------------------------------------------------------------------
-- 6. Private spaces cannot be joined by id-guessing (review: medium RLS item)
--
-- space_members_insert used to allow user_id = auth.uid() unconditionally, so
-- anyone who learned a space id could join a private space. Self-join now
-- requires the space to be public; private spaces grow only when the owner
-- (or admin path, unchanged) adds someone.
-- ---------------------------------------------------------------------------

drop policy if exists space_members_insert on public.space_members;
create policy space_members_insert on public.space_members
  for insert with check (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.spaces s
        where s.id = space_id and s.is_public
      )
    )
    or exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Disappearing messages must actually disappear from search
-- ---------------------------------------------------------------------------

drop function if exists public.search_messages(text, int);

create function public.search_messages(query text, result_limit int default 25)
returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  rank real
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.content,
    m.created_at,
    ts_rank(m.search_vector, websearch_to_tsquery('simple', query)) as rank
  from public.messages m
  where m.deleted_for_everyone = false
    and (m.expires_at is null or m.expires_at > now())
    and public.is_conversation_member(m.conversation_id)
    and (
      m.search_vector @@ websearch_to_tsquery('simple', query)
      or m.content ilike '%' || query || '%'
    )
  order by m.created_at desc
  limit greatest(1, least(coalesce(result_limit, 25), 100));
$$;

grant execute on function public.search_messages(text, int) to authenticated;
revoke execute on function public.search_messages(text, int) from anon;

-- ---------------------------------------------------------------------------
-- 8. Branch roots cannot cross conversations (review: medium RLS item)
--
-- root_message_id had a foreign key to messages(id) but nothing tying it to
-- the branch's own conversation, so a member of A could root a branch in A at
-- a message from B. A composite FK needs a matching unique constraint first;
-- (conversation_id, id) is trivially unique since id is the PK.
-- ---------------------------------------------------------------------------

-- Remove any cross-conversation roots before constraining; they are invalid.
delete from public.conversation_branches b
where b.root_message_id is not null
  and not exists (
    select 1 from public.messages m
    where m.id = b.root_message_id
      and m.conversation_id = b.conversation_id
  );

alter table public.conversation_branches
  drop constraint if exists conversation_branches_root_message_id_fkey;

create unique index if not exists messages_conversation_id_key
  on public.messages (conversation_id, id);

alter table public.conversation_branches
  add constraint conversation_branches_root_same_conversation_fkey
  foreign key (conversation_id, root_message_id)
  references public.messages (conversation_id, id)
  on delete set null
  not valid;

-- Validate against existing rows now that the invalid ones are gone.
alter table public.conversation_branches
  validate constraint conversation_branches_root_same_conversation_fkey;

-- ---------------------------------------------------------------------------
-- 9. Realtime publication gaps (review finding 7)
--
-- spaces, space_members, plans and friendships all have client subscriptions
-- bound to them, but none were in the publication — so those subscriptions
-- silently received nothing. The Activity tab never updated live, Pulse never
-- reordered on a plan response, and space membership changes did not stream.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['spaces', 'space_members', 'plans', 'friendships']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;