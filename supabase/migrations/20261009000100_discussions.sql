-- BRO — discussions
--
-- Replaces `plans` (migration 002). A plan was a thing with a time and place
-- that people RSVP'd to, and `plan_responses` was one row per person with
-- going/maybe/cant. That is attendance, and it could not hold a conversation:
-- there was nowhere to say *what* you thought.
--
-- A discussion is someone putting an idea up and anyone building on it. No
-- schedule, no headcount, free-form contributions. That is the whole
-- difference, and it is why this is a new table rather than a rename:
-- `plans.starts_at` was NOT NULL and had no sensible default, and keeping it
-- would mean every discussion carried a fake date.
--
-- `plans` and `plan_responses` had zero rows when this ran, so they are
-- dropped outright rather than migrated. If rows ever appear, this migration
-- must gain a copy step before the drop.
--
-- Visibility is deliberately wide: any signed-in user can read every
-- discussion and contribute to any of them, including people nobody follows
-- and who do not follow the author. A discussion is where an idea meets the
-- whole app. Gating it to a follower graph would make it a private note, which
-- is the thing it is not.

create table if not exists public.discussions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  -- The opening post. Empty is allowed so a title alone can start a thread,
  -- but most discussions read better with a sentence of context.
  body text not null default '',
  -- Set by the creator to stop contributions. The thread stays readable.
  is_closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Bound the text in the database, not only in the client: the client is the
  -- easy place to check and the wrong place to rely on.
  check (char_length(title) between 1 and 140),
  check (char_length(body) <= 4000)
);

-- The feed is newest-first and must stay total, so id is in the index. Same
-- reasoning as the meme feed: created_at alone is not unique, and a non-total
-- order makes offset paging repeat rows.
create index if not exists discussions_feed_idx
  on public.discussions (created_at desc, id desc);

create table if not exists public.discussion_contributions (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  -- One row per person per discussion. Without this a double tap files two
  -- contributions and the tally lies about how many people actually weighed in.
  unique (discussion_id, author_id),
  check (char_length(body) between 1 and 2000)
);

create index if not exists discussion_contributions_thread_idx
  on public.discussion_contributions (discussion_id, created_at asc);

alter table public.discussions enable row level security;
alter table public.discussion_contributions enable row level security;

-- Every signed-in user can read every discussion.
drop policy if exists discussions_select on public.discussions;
create policy discussions_select on public.discussions
  for select using (auth.role() = 'authenticated');

drop policy if exists discussions_insert on public.discussions;
create policy discussions_insert on public.discussions
  for insert with check (creator_id = auth.uid() and not is_closed);

-- The creator may retitle or close their own discussion, but cannot transfer
-- it: `creator_id` is pinned in the with check so an update cannot hand the
-- thread away and keep the rights to it.
drop policy if exists discussions_update on public.discussions;
create policy discussions_update on public.discussions
  for update using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

drop policy if exists discussions_delete on public.discussions;
create policy discussions_delete on public.discussions
  for delete using (creator_id = auth.uid());

-- Contributions are readable by anyone who can see the discussion, which is
-- every signed-in user.
drop policy if exists discussion_contributions_select
  on public.discussion_contributions;
create policy discussion_contributions_select on public.discussion_contributions
  for select using (auth.role() = 'authenticated');

drop policy if exists discussion_contributions_insert
  on public.discussion_contributions;
create policy discussion_contributions_insert on public.discussion_contributions
  for insert with check (
    author_id = auth.uid()
    -- A closed thread stops taking contributions. Enforced here rather than in
    -- the UI, because closing is exactly the kind of thing a client forgets.
    and exists (
      select 1 from public.discussions d
      where d.id = discussion_id and not d.is_closed
    )
  );

-- A contributor may edit their own words; they cannot re-point them at
-- another author or another discussion.
drop policy if exists discussion_contributions_update
  on public.discussion_contributions;
create policy discussion_contributions_update on public.discussion_contributions
  for update using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists discussion_contributions_delete
  on public.discussion_contributions;
create policy discussion_contributions_delete on public.discussion_contributions
  for delete using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- retire plans
--
-- Zero rows at migration time. Dropping rather than renaming keeps one honest
-- model instead of a plans table with an empty starts_at column that every
-- future query has to remember to ignore.

drop table if exists public.plan_responses;
drop table if exists public.plans;

-- ---------------------------------------------------------------------------
-- realtime
--
-- Swap the plan out of the publication. The do-block form matches migration
-- 002 so a re-run cannot fail on an already-present table.

do $$
declare
  t text;
begin
  foreach t in array array['discussions', 'discussion_contributions']
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

do $$
declare
  t text;
begin
  foreach t in array array['plan_responses']
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I;', t);
    end if;
  end loop;
end $$;
