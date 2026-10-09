-- BRO — follows
--
-- The graph the status feed is actually built on.
--
-- Until now a status was visible to people you share a conversation with.
-- That is a reasonable default and a useless feed: on a fresh install the
-- contact graph is empty, so nobody else's status is ever returned and the
-- tray is permanently blank. The data layer was fine; there was just no
-- relationship to read it through.
--
-- Follow is directional and needs no acceptance. That is the deliberate
-- difference from `friendships` (migration 008), which is request/accept.
-- Following here is a subscription to someone's stories, in the sense of an
-- RSS feed, not a claim about the relationship. Bro's People model is
-- communication-oriented, so this is the only one of the two that is
-- appropriate for a public-ish status feed.
--
-- Model notes:
--   * One row per ordered pair. No self-follows, enforced by a check.
--   * Blocks win, same as friendships. A block deletes follow rows in both
--     directions, and following across a block is refused outright — a
--     trigger, because cleaning this up from the client is exactly how a
--     blocked person keeps receiving stories.
--   * Unfollowing is a delete, so the feed has one way to shrink.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- Reading "who follows X" leads with followee_id; "who does X follow" leads
-- with follower_id. Both directions get an index because the tray needs one and
-- the profile screen needs the other.
create index if not exists follows_followee_idx
  on public.follows (followee_id, created_at desc);

create index if not exists follows_follower_idx
  on public.follows (follower_id, created_at desc);

alter table public.follows enable row level security;

-- You see the edges you are an endpoint of, in either direction: that is
-- exactly what is needed for "do I follow them" and "how many follow me".
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select using (
    follower_id = auth.uid()
    or followee_id = auth.uid()
  );

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert with check (follower_id = auth.uid());

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete using (follower_id = auth.uid());

-- Blocks win over follows. Blocking someone removes the follow rows between
-- the pair, so they immediately stop appearing in the blocker's feed and the
-- blocked person's feed stops offering them.
create or replace function public.clear_follows_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and followee_id = new.blocked_id)
     or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists blocks_clear_follows on public.blocks;
create trigger blocks_clear_follows
  after insert on public.blocks
  for each row
  execute function public.clear_follows_on_block();

-- Following someone who has blocked you (or whom you blocked) is refused,
-- so a block cannot be side-stepped by re-following.
create or replace function public.reject_blocked_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.blocks_between(new.follower_id, new.followee_id) then
    raise exception 'cannot follow: a block exists between these users'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists follows_reject_blocked on public.follows;
create trigger follows_reject_blocked
  before insert on public.follows
  for each row
  execute function public.reject_blocked_follow();

-- ---------------------------------------------------------------------------
-- Status visibility, rewritten in terms of the graph
--
-- Your own statuses, plus the statuses of people you follow. This replaces the
-- mutual-conversation-members rule, which is what left the tray empty.
--
-- Note this is a superset of the old rule in the common case: anyone you share
-- a conversation with is usually someone you follow, and anyone you follow is
-- now visible even if you have never spoken. That widening is the point.
drop policy if exists statuses_select on public.status_updates;
create policy statuses_select on public.status_updates
  for select using (
    author_id = auth.uid()
    or exists (
      select 1
      from public.follows f
      where f.follower_id = auth.uid()
        and f.followee_id = status_updates.author_id
    )
  );

-- The reply policies already gate on "can you select the status", so they
-- inherit the new rule with no change of their own. Same for status_views,
-- which was deliberately written that way.
