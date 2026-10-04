-- BRO — friendships
--
-- Who's Around has always listed conversation peers as the honest interim for
-- "friends". This makes the graph real: requests with an explicit accept step,
-- so nobody lands in your circle without agreeing to be there.
--
-- Model notes:
--
--   * One row per ordered pair, status pending -> accepted | declined. A second
--     request while one is pending is a no-op at most, never a duplicate row.
--   * "Are X and Y friends" means an accepted row in EITHER direction. There is
--     no separate symmetric table to keep in sync.
--   * Blocks win over friendships. A blocked user cannot request you, and an
--     outstanding request in either direction is removed when a block lands.
--     That last part is a trigger, because relying on the client to clean up
--     after blocking is exactly how ghost requests survive.

create table if not exists public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friendships_addressee_idx
  on public.friendships (addressee_id, status, created_at desc);

create index if not exists friendships_requester_idx
  on public.friendships (requester_id, status, created_at desc);

alter table public.friendships enable row level security;

-- You see requests you sent and requests sent to you. Nobody else sees them.
drop policy if exists friendships_select on public.friendships;
create policy friendships_select on public.friendships
  for select using (
    requester_id = auth.uid()
    or addressee_id = auth.uid()
  );

-- You can only ever request as yourself, and only into pending.
drop policy if exists friendships_insert on public.friendships;
create policy friendships_insert on public.friendships
  for insert with check (
    requester_id = auth.uid()
    and status = 'pending'
  );

-- Only the recipient moves a request: accept or decline. The requester cannot
-- accept their own request, and nobody else can touch it.
drop policy if exists friendships_update on public.friendships;
create policy friendships_update on public.friendships
  for update using (addressee_id = auth.uid())
  with check (
    addressee_id = auth.uid()
    and status in ('accepted', 'declined')
  );

-- Either side can end it: the requester cancels, the addressee declines by
-- deletion, and either side unfriends. Deleting is the unfriend path.
drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete on public.friendships
  for delete using (
    requester_id = auth.uid()
    or addressee_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- Blocks win
-- ---------------------------------------------------------------------------

-- A new block wipes any friendship rows between the pair in both directions,
-- so a blocked user cannot linger as a pending request or a friend.
create or replace function public.clear_friendships_on_block()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
  where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
     or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end;
$$;

drop trigger if exists blocks_clear_friendships on public.blocks;
create trigger blocks_clear_friendships
  after insert on public.blocks
  for each row
  execute function public.clear_friendships_on_block();

-- A friendship request to someone who blocked you (or who you blocked) is
-- rejected outright rather than created and hidden.
create or replace function public.reject_blocked_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.blocks b
    where (b.blocker_id = new.requester_id and b.blocked_id = new.addressee_id)
       or (b.blocker_id = new.addressee_id and b.blocked_id = new.requester_id)
  ) then
    raise exception 'cannot request: a block exists between these users'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists friendships_reject_blocked on public.friendships;
create trigger friendships_reject_blocked
  before insert on public.friendships
  for each row
  execute function public.reject_blocked_friend_request();

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_friendship_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists friendships_touch_updated on public.friendships;
create trigger friendships_touch_updated
  before update on public.friendships
  for each row
  execute function public.touch_friendship_updated_at();