-- BRO — activity and notifications
--
-- Two problems are fixed here.
--
-- 1. PRIVACY. `activity` was readable by `auth.role() = 'authenticated'`, which
--    means every signed-in user could read every other user's activity: who
--    replied to whom, who mentioned whom, who followed whom. For a private
--    group that is a leak. The policy below narrows visibility to rows that are
--    actually relevant to the reader.
--
-- 2. NOTHING POPULATED notifications. The table existed and was correctly
--    scoped to its owner, but no code or trigger ever wrote to it, so an
--    Activity screen built on it would have been permanently empty. The fan-out
--    trigger below creates one notification per legitimate recipient at the
--    moment the activity happens.
--
-- Design note: the Activity screen reads `notifications` (owner-scoped), not
-- `activity` directly. That keeps the privacy fix and the feature aligned —
-- there is one code path and it is the narrow one.

-- ---------------------------------------------------------------------------
-- 1. Tighten activity visibility
-- ---------------------------------------------------------------------------

-- Visible when: you performed it, you are the user it targets, or it happened
-- inside a conversation you belong to. Anything else stays hidden.
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select using (
    actor_id = auth.uid()
    or (
      target_type = 'user'
      and target_id = auth.uid()
    )
    or (
      target_type = 'conversation'
      and public.is_conversation_member(target_id)
    )
    or (
      target_type = 'message'
      and exists (
        select 1
        from public.messages m
        where m.id = activity.target_id
          and public.is_conversation_member(m.conversation_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Fan out notifications
-- ---------------------------------------------------------------------------

-- Recipients per activity type:
--   reply             -> the author of the message replied to
--   reaction          -> the author of the reacted-to message
--   mention           -> the mentioned user
--   join              -> the space owner
--   invite / follow   -> the invited / followed user
--
-- The actor never notifies themselves. Duplicates are prevented per recipient
-- by the (activity_id, user_id) primary key.
create or replace function public.fan_out_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid := new.target_id;
  recipient uuid;
begin
  case new.type
    when 'reply' then
      -- A reply notifies the author of the message being replied to.
      if target is not null then
        select m.sender_id into recipient from public.messages m where m.id = target;
        if recipient is not null and recipient <> new.actor_id then
          insert into public.notifications (activity_id, user_id, deep_link)
          values (new.id, recipient, '/chat')
          on conflict do nothing;
        end if;
      end if;

    when 'reaction' then
      -- A reaction notifies the author of the reacted-to message.
      if target is not null then
        select m.sender_id into recipient from public.messages m where m.id = target;
        if recipient is not null and recipient <> new.actor_id then
          insert into public.notifications (activity_id, user_id, deep_link)
          values (new.id, recipient, '/chat')
          on conflict do nothing;
        end if;
      end if;

    when 'mention' then
      if target is not null and target <> new.actor_id then
        insert into public.notifications (activity_id, user_id, deep_link)
        values (new.id, target, '/chat')
        on conflict do nothing;
      end if;

    when 'join' then
      -- Notify the space owner that somebody joined their space.
      if new.target_type = 'space' and target is not null then
        insert into public.notifications (activity_id, user_id, deep_link)
        select new.id, s.owner_id, '/spaces'
        from public.spaces s
        where s.id = target and s.owner_id <> new.actor_id
        on conflict do nothing;
      end if;

    when 'invite', 'follow' then
      if target is not null and target <> new.actor_id then
        insert into public.notifications (activity_id, user_id, deep_link)
        values (new.id, target, '/people')
        on conflict do nothing;
      end if;

    else
      null;
  end case;

  return new;
end;
$$;

drop trigger if exists activity_fan_out on public.activity;
create trigger activity_fan_out
  after insert on public.activity
  for each row
  execute function public.fan_out_activity_notification();

-- ---------------------------------------------------------------------------
-- 3. Realtime
-- ---------------------------------------------------------------------------

-- Notifications must stream so the Activity screen updates live and the unread
-- badge does not go stale.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Supporting index
-- ---------------------------------------------------------------------------

-- Activity reads filter on target_id within a type; this keeps that cheap.
create index if not exists activity_target_idx
  on public.activity (target_type, target_id, created_at desc);