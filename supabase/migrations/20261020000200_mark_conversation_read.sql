-- Monotonic, server-clamped read cursor.
--
-- The client used to PATCH last_read_at = now() directly. That trusts the
-- device clock: a phone running behind the server would write a timestamp
-- earlier than a message it had just read, so the sender never saw "seen".
-- Two racing writes could also move the cursor backwards.
--
-- This takes the timestamp of the message actually being read (always a server
-- value), keeps the maximum of the existing cursor and the new one, and clamps
-- to now() so a client cannot claim to have read the future. security invoker
-- keeps the conversation_members RLS policy in force, so a caller can only
-- move their own row.
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
  returning last_read_at;
$$;

grant execute on function public.mark_conversation_read(uuid, timestamptz)
  to authenticated;

comment on function public.mark_conversation_read(uuid, timestamptz) is
  'Advance the caller''s read cursor monotonically, using a server timestamp.';
