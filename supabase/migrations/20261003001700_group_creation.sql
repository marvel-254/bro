-- ---------------------------------------------------------------------------
-- 017: group conversation creation
--
-- Direct conversations could be created since migration 011, but groups could
-- not be created at all -- the client had no path and there was no RPC. That
-- made the app unable to do the most basic thing a group of friends needs.
--
-- This follows the same reasoning as create_direct_conversation: creation
-- happens server-side in a security definer function, never as a client
-- sequence of inserts. The membership table has to stay unreachable to
-- arbitrary writes, because "insert any user_id into a conversation" is the
-- primitive that lets someone add a stranger to a group and spam them.
--
-- The membership rule that matters here: you can only add people you already
-- have a relationship with -- an accepted friendship, or anyone you share a
-- Space with. Without that check, group creation is a harassment tool: pick any
-- profile id and pull them into a conversation they never agreed to.
-- ---------------------------------------------------------------------------

create or replace function public.create_group_conversation(
  group_title text,
  member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  created uuid;
  trimmed text;
  target uuid;
  inserted int := 0;
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  trimmed := btrim(coalesce(group_title, ''));
  if length(trimmed) < 1 or length(trimmed) > 80 then
    raise exception 'group name must be 1-80 characters' using errcode = '22023';
  end if;

  if member_ids is null or array_length(member_ids, 1) is null then
    raise exception 'pick at least one other bro' using errcode = '22023';
  end if;

  -- Create the conversation up front so memberships can reference it
  -- directly. Inserting members against a placeholder id and rewriting
  -- afterwards would collide on the (conversation_id, user_id) primary key
  -- whenever two groups were created at the same moment.
  insert into public.conversations (type, name, created_by)
  values ('group', trimmed, caller)
  returning id into created;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (created, caller, 'admin');

  -- De-duplicate and drop the caller: the creator is already an admin, and a
  -- duplicate uuid in the array would violate the memberships primary key.
  for target in
    select distinct unnest(member_ids)
  loop
    if target = caller then
      continue;
    end if;

    if not exists (select 1 from public.profiles where id = target) then
      raise exception 'one of those bros no longer exists' using errcode = '22023';
    end if;

    -- Relationship gate: accepted friendship in either direction, or a shared
    -- Space. This is what stops group creation being used to reach strangers.
    if not (
      exists (
        select 1 from public.friendships f
        where f.status = 'accepted'
          and (
            (f.requester_id = caller and f.addressee_id = target)
            or (f.addressee_id = caller and f.requester_id = target)
          )
      )
      or exists (
        select 1
        from public.space_members mine
        join public.space_members theirs on theirs.space_id = mine.space_id
        where mine.user_id = caller and theirs.user_id = target
      )
      or exists (
        select 1
        from public.conversation_members mine
        join public.conversation_members theirs
          on theirs.conversation_id = mine.conversation_id
        where mine.user_id = caller and theirs.user_id = target
      )
    ) then
      raise exception 'you can only add bros you already share something with'
        using errcode = '22023';
    end if;

    insert into public.conversation_members (conversation_id, user_id, role)
    values (created, target, 'member');
    inserted := inserted + 1;
  end loop;

  if inserted = 0 then
    -- Nothing was addable, so do not leave an empty group behind.
    delete from public.conversations where id = created;
    raise exception 'pick at least one other bro' using errcode = '22023';
  end if;

  return created;
end;
$$;

revoke all on function public.create_group_conversation(text, uuid[]) from public;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
