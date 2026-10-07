-- ---------------------------------------------------------------------------
-- 015: make blocking actually enforce
--
-- The blocks table and its RLS shipped in tranche 1, and migration 008 uses it
-- to reject friend requests between blocked people. Nothing else consulted it,
-- so "block" was decorative: a blocked user could still read the messages they
-- were blocked from, and could still open a fresh direct conversation.
--
-- Blocking is only worth having if it holds at the read path, so this adds:
--   * a single helper both policies and the RPC can call
--   * message visibility that honours blocks in both directions
--   * a guard so a block stops a new direct conversation being opened
--
-- Blocks stay private (nobody, including the blocked user, can see them), so
-- this helper is security definer: the caller cannot read `blocks` directly,
-- but policies need to be able to ask the question.
-- ---------------------------------------------------------------------------

create or replace function public.blocks_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function public.blocks_between(uuid, uuid) from public;
grant execute on function public.blocks_between(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- message visibility
--
-- A message is hidden when a block exists in either direction between its
-- sender and the reader. Applied to the reader, not the sender, so blocking
-- someone does not delete your own history.
-- ---------------------------------------------------------------------------

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_conversation_member(conversation_id)
    and not deleted_for_everyone
    and (expires_at is null or expires_at > now())
    and not public.blocks_between(sender_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- sending
--
-- Symmetric with reading: a block in either direction stops the insert, so the
-- blocked user cannot push new messages into a thread they should be shut out
-- of.
-- ---------------------------------------------------------------------------

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    public.is_conversation_member(conversation_id)
    and sender_id = auth.uid()
    and not public.blocks_between(sender_id, auth.uid())
  );

-- ---------------------------------------------------------------------------
-- no new direct conversation across a block
--
-- Guards the case where someone was blocked and had not yet opened a thread:
-- without this they could keep starting fresh 1-1s, which makes blocking
-- trivially bypassable.
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

  insert into public.conversations (type, created_by)
  values ('direct', caller)
  returning id into created;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (created, caller, 'admin'), (created, peer_id, 'member');

  return created;
end;
$$;

revoke all on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
