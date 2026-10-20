-- ---------------------------------------------------------------------------
-- Privacy controls for presence, typing and read receipts
--
-- These are per-user switches, not per-conversation exceptions:
--   * share_presence      may others see you as active?
--   * share_last_active   may others see when you were last online?
--   * share_typing        do you broadcast "typing..."?
--   * share_read_receipts do peers see your read cursor?
--
-- Defaults are privacy-safe but still useful: active now is visible, an exact
-- last-seen time is not, typing is on (it clears itself), and receipts are on
-- because they are the expected behaviour of a chat app.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists share_presence boolean not null default true,
  add column if not exists share_last_active boolean not null default false,
  add column if not exists share_typing boolean not null default true,
  add column if not exists share_read_receipts boolean not null default true;

comment on column public.profiles.share_presence is
  'When false, presence is written as offline and not broadcast in conversations.';
comment on column public.profiles.share_last_active is
  'When false, last_seen_at is not updated and must not be shown to others.';
comment on column public.profiles.share_typing is
  'When false, the client must not broadcast typing events.';
comment on column public.profiles.share_read_receipts is
  'When false, peers must not see this member''s last_read_at.';

-- Read cursors are already visible to every member through
-- conversation_members. Gate the peer cursors at the source so a client that
-- forgets to filter cannot leak a disabled receipt. The caller always gets
-- their own cursor, which drives their unread state locally.
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
  where m.conversation_id = p_conversation_id
    and public.is_conversation_member(p_conversation_id)
    and (m.user_id = auth.uid() or p.share_read_receipts);
$$;

revoke all on function public.conversation_read_cursors(uuid) from public;
grant execute on function public.conversation_read_cursors(uuid) to authenticated;
