-- BRO — conversation branches
--
-- `conversation_branches` already existed but could not actually work:
--
--   1. `root_message_id` was a bare uuid with no foreign key, so it could
--      point at a message that does not exist (or never could).
--   2. `message_count` is a stored integer and NOTHING maintained it. It would
--      have stayed 0 forever, which is the exact number the "N replies" pill is
--      supposed to show. A denormalised counter nobody updates is worse than no
--      counter, because it looks correct.
--
-- Both are fixed here: a real foreign key, and a trigger that keeps the counter
-- and last_activity_at honest on every insert, move and delete.

-- ---------------------------------------------------------------------------
-- 1. root_message_id integrity
-- ---------------------------------------------------------------------------

-- Drop any roots that point at nothing before adding the constraint, otherwise
-- the FK cannot be created. These rows are unrecoverable anyway.
delete from public.conversation_branches
where root_message_id is not null
  and not exists (
    select 1 from public.messages m where m.id = conversation_branches.root_message_id
  );

alter table public.conversation_branches
  drop constraint if exists conversation_branches_root_message_id_fkey;

alter table public.conversation_branches
  add constraint conversation_branches_root_message_id_fkey
  foreign key (root_message_id) references public.messages (id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Keep the denormalised counter honest
-- ---------------------------------------------------------------------------

create or replace function public.sync_branch_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected uuid;
begin
  -- The branch this statement touches: the new one on insert or move, the old
  -- one on delete.
  if tg_op = 'INSERT' then
    affected := new.branch_id;
  elsif tg_op = 'DELETE' then
    affected := old.branch_id;
  else
    affected := case
      when old.branch_id is distinct from new.branch_id then old.branch_id
      else new.branch_id
    end;
  end if;

  if affected is not null then
    update public.conversation_branches b
       set message_count = (
             select count(*) from public.messages m
             where m.branch_id = affected
               and m.deleted_for_everyone = false
           ),
           last_activity_at = coalesce((
             select max(m.created_at) from public.messages m
             where m.branch_id = affected
           ), b.created_at)
     where b.id = affected;
  end if;

  -- On a move between branches, the branch we came out of needs recounting too.
  if tg_op = 'UPDATE'
     and old.branch_id is distinct from new.branch_id
     and old.branch_id is not null then
    update public.conversation_branches b
       set message_count = (
             select count(*) from public.messages m
             where m.branch_id = old.branch_id
               and m.deleted_for_everyone = false
           ),
           last_activity_at = coalesce((
             select max(m.created_at) from public.messages m
             where m.branch_id = old.branch_id
           ), b.created_at)
     where b.id = old.branch_id;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists messages_sync_branch on public.messages;
create trigger messages_sync_branch
  after insert or update of branch_id or delete on public.messages
  for each row
  execute function public.sync_branch_counters();

-- Re-seed counters for branches that already hold messages, so the first render
-- after this migration is not wrong.
update public.conversation_branches b
   set message_count = (
         select count(*) from public.messages m
         where m.branch_id = b.id
           and m.deleted_for_everyone = false
       ),
       last_activity_at = coalesce((
         select max(m.created_at) from public.messages m
         where m.branch_id = b.id
       ), b.last_activity_at);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

create index if not exists branches_root_idx
  on public.conversation_branches (root_message_id)
  where root_message_id is not null;

-- The chat screen needs "how many direct replies does this message have"
-- without an N+1 query per row. This supports that group-by.
create index if not exists messages_reply_to_created_idx
  on public.messages (reply_to_message_id, created_at desc)
  where reply_to_message_id is not null;

-- ---------------------------------------------------------------------------
-- 4. One-level-deep guard
-- ---------------------------------------------------------------------------

-- A branch holds messages, not sub-branches. Enforced in the app layer when a
-- message is posted into a branch; the index keeps the root lookup cheap.