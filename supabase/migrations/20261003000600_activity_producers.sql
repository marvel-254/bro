-- BRO — activity producers
--
-- Migration 004 built the fan-out (activity -> notifications) but nothing ever
-- WROTE an activity row, so the Activity feed was permanently empty.
--
-- The obvious fix is to call recordActivity() from the client on each action.
-- That is the wrong place: it only fires when the client remembers to call it,
-- so a background send, a second client, or a client that dies mid-flight
-- silently loses the event. It also cannot be trusted, because the client is the
-- party we least want asserting who did what.
--
-- Instead these triggers derive activity from the rows themselves. The actor is
-- always taken from the row (messages.sender_id, message_reactions.user_id,
-- space_members.user_id), never from a parameter, so the database is the source
-- of truth for who did what.
--
-- Events covered: replies, @mentions, reactions, space joins.
-- invite / follow have no UI yet and stay client-recorded via recordActivity().

-- ---------------------------------------------------------------------------
-- Replies and mentions, derived from message inserts
-- ---------------------------------------------------------------------------

create or replace function public.record_message_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text;
  mentioned uuid;
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
        insert into public.activity (type, actor_id, target_id, target_type)
        values ('mention', new.sender_id, mentioned, 'user');
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists messages_record_activity on public.messages;
create trigger messages_record_activity
  after insert on public.messages
  for each row
  execute function public.record_message_activity();

-- ---------------------------------------------------------------------------
-- Reactions
-- ---------------------------------------------------------------------------

-- Only on insert. Removing a reaction must not notify the author that you
-- reacted when you actually un-reacted.
create or replace function public.record_reaction_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select m.sender_id into owner
  from public.messages m
  where m.id = new.message_id;

  if owner is not null and owner <> new.user_id then
    insert into public.activity (type, actor_id, target_id, target_type)
    values ('reaction', new.user_id, new.message_id, 'message');
  end if;

  return new;
end;
$$;

drop trigger if exists reactions_record_activity on public.message_reactions;
create trigger reactions_record_activity
  after insert on public.message_reactions
  for each row
  execute function public.record_reaction_activity();

-- ---------------------------------------------------------------------------
-- Space joins
-- ---------------------------------------------------------------------------

-- Fires for members only. The owner membership row is written by createSpace,
-- and "owner joined their own space" is not news.
create or replace function public.record_space_join_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'member' then
    insert into public.activity (type, actor_id, target_id, target_type)
    values ('join', new.user_id, new.space_id, 'space');
  end if;

  return new;
end;
$$;

drop trigger if exists space_members_record_activity on public.space_members;
create trigger space_members_record_activity
  after insert on public.space_members
  for each row
  execute function public.record_space_join_activity();

-- ---------------------------------------------------------------------------
-- Keeping activity from growing without bound
-- ---------------------------------------------------------------------------

-- Activity is a derived log, not a record of record. Notifications, which users
-- actually read, are pruned separately and later, so this never silently
-- empties a feed.
create or replace function public.prune_old_activity()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.activity
  where created_at < now() - interval '30 days';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.prune_old_activity() is
  'Deletes activity older than 30 days. Notifications are deliberately left
   alone so pruning never silently empties a user feed. Not scheduled yet -- wire
   to pg_cron or an Edge Function when the volume justifies it.';