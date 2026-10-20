-- Mention notifications opened the chat list, not the message.
--
-- A mention was recorded with target_id = the mentioned *user* and
-- target_type = 'user'. The client cannot turn a user id into a place, so
-- resolveActivityDestination() returned null and the tap fell back to /chats.
--
-- The message id is the useful target, but the fan-out trigger only sees the
-- activity row and would lose the recipient if the target changed to the
-- message. The producer knows both, so it targets the message and writes the
-- notification itself. Mentions are unique per (sender, message, handle), so
-- deleting and re-sending a message cannot duplicate them.

create or replace function public.record_message_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text;
  mentioned uuid;
  activity_id uuid;
begin
  -- A reply. The fan-out trigger resolves the parent message's author as the
  -- recipient, so activity only needs to point at the parent.
  if new.reply_to_message_id is not null and new.deleted_for_everyone = false then
    insert into public.activity (type, actor_id, target_id, target_type)
    values ('reply', new.sender_id, new.reply_to_message_id, 'message');
  end if;

  -- @mentions. Extract every @handle in the body and resolve it to a profile.
  -- Unresolvable handles are skipped rather than creating a dangling row.
  for handle in
    select m[1]
    from regexp_matches(coalesce(new.content, ''), '@([A-Za-z0-9_]{2,32})', 'g') as m
  loop
    if new.deleted_for_everyone = false then
      select p.id into mentioned
      from public.profiles p
      where lower(p.username) = lower(handle)
      limit 1;

      if mentioned is not null and mentioned <> new.sender_id then
        -- Target the message so the client can open it (and the thread it is
        -- in), not the mentioned user, which is not a destination.
        insert into public.activity (type, actor_id, target_id, target_type)
        values ('mention', new.sender_id, new.id, 'message')
        returning id into activity_id;

        insert into public.notifications (activity_id, user_id, deep_link)
        values (
          activity_id,
          mentioned,
          case
            when new.branch_id is not null then
              '/chat/' || new.conversation_id::text
                || '/branch/' || new.branch_id::text
                || '?message=' || new.id::text
            else
              '/chat/' || new.conversation_id::text
                || '?message=' || new.id::text
          end
        )
        on conflict do nothing;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

-- The producer now owns mention notifications. Leaving this branch in place
-- would try to use the message id as a user id and violate the notifications
-- foreign key, aborting the message insert.
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
      -- Handled by record_message_activity(), which is the only place that
      -- still knows the mentioned user after target_id became the message.
      null;

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
