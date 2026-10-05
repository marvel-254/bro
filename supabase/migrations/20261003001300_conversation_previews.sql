-- BRO — bounded conversation previews
--
-- fetchConversationSummaries and fetchSpaceConversations embedded the full
-- `messages` relation inside a 50-row conversation select. PostgREST applies
-- no limit to the embedded side, so a 10k-message group returned its entire
-- history on every list render. The lists only ever needed two things per
-- conversation: the latest message, and how many messages are newer than the
-- caller's read cursor.
--
-- This RPC returns exactly one row per conversation: the latest message plus
-- the unread count for auth.uid(), excluding their own messages. Bounded by
-- construction — output size is O(conversations), never O(messages).

create or replace function public.conversation_previews(ids uuid[])
returns table (
  conversation_id uuid,
  message_id uuid,
  content text,
  sender_id uuid,
  created_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (m.conversation_id)
      m.conversation_id,
      m.id,
      m.content,
      m.sender_id,
      m.created_at
    from public.messages m
    where m.conversation_id = any (ids)
      and m.branch_id is null
      and m.deleted_for_everyone = false
    order by m.conversation_id, m.created_at desc, m.id desc
  ),
  cursors as (
    select cm.conversation_id, cm.last_read_at
    from public.conversation_members cm
    where cm.conversation_id = any (ids)
      and cm.user_id = auth.uid()
  )
  select
    l.conversation_id,
    l.id,
    l.content,
    l.sender_id,
    l.created_at,
    coalesce((
      select count(*)
      from public.messages m
      where m.conversation_id = l.conversation_id
        and m.branch_id is null
        and m.deleted_for_everyone = false
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(
          (select c.last_read_at from cursors c where c.conversation_id = l.conversation_id),
          'epoch'::timestamptz
        )
    ), 0)
  from latest l;
$$;

comment on function public.conversation_previews(uuid[]) is
  'One row per conversation: latest non-branch, non-deleted message plus the
   caller unread count. Replaces unbounded embedded message selects.';

grant execute on function public.conversation_previews(uuid[]) to authenticated;
revoke execute on function public.conversation_previews(uuid[]) from anon;
revoke execute on function public.conversation_previews(uuid[]) from public;
grant execute on function public.conversation_previews(uuid[]) to service_role;