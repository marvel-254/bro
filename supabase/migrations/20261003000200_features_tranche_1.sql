-- BRO — feature tranche 1 schema
--
-- Adds the data model for: presence, typing, read receipts, disappearing
-- messages, edit/delete, invite links, pins, drops, status wall, squads,
-- plans, custom reactions, blocks and mutes.
--
-- Media upload, voice notes and encryption are deliberately NOT modelled as
-- finished capabilities here. Attachments gain the wider kind set and every
-- table is additive, so nothing in this migration depends on a storage bucket
-- or an encryption scheme that has not been implemented and verified.

-- ---------------------------------------------------------------------------
-- profiles: presence
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists presence text not null default 'offline'
    check (presence in ('online', 'busy', 'chilling', 'gaming', 'listening', 'afk', 'offline')),
  add column if not exists presence_text text,
  add column if not exists presence_emoji text;

comment on column public.profiles.presence is 'Transient presence state. "online" is the only state that implies reachability.';

-- ---------------------------------------------------------------------------
-- messages: disappearing, edits, deletes
-- ---------------------------------------------------------------------------

alter table public.messages
  add column if not exists expires_at timestamptz,
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_for_everyone boolean not null default false;

comment on column public.messages.expires_at is
  'Disappearing-message deadline. Null means the message never expires. Rows past this are hidden by clients and purged by the cleanup function below.';

-- Deleted messages keep their row so replies and branches do not dangle; the
-- content is blanked rather than the row removed. Attachments are removed by
-- the foreign key cascade when the parent goes, so only text needs clearing.
create or replace function public.scrub_deleted_messages()
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
     set content = ''
   where deleted_for_everyone
     and content <> '';
$$;

-- ---------------------------------------------------------------------------
-- attachments: widen the media kinds
-- ---------------------------------------------------------------------------

-- The original table has mime_type but no kind, so the media kind is added
-- rather than renaming: existing callers reading mime_type keep working.
alter table public.attachments
  add column if not exists kind text not null default 'file'
    check (kind in ('image', 'video', 'gif', 'sticker', 'voice', 'file', 'location'));

-- ---------------------------------------------------------------------------
-- typing + presence are realtime broadcasts, not tables.
--
-- Typing state must never hit disk: it is high-frequency and worthless a
-- second later. Presence is persisted on profiles because it is read by
-- people who are not currently in the conversation.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  token text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  max_uses integer,
  uses integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invites_conversation_idx on public.invites (conversation_id);

alter table public.invites enable row level security;

drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert with check (
    created_by = auth.uid()
    and public.is_conversation_admin(conversation_id)
  );

drop policy if exists invites_update on public.invites;
create policy invites_update on public.invites
  for update using (public.is_conversation_admin(conversation_id));

-- A revoked or expired invite is a row nobody may delete; only the issuing
-- conversation can hide it.
drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites
  for delete using (public.is_conversation_admin(conversation_id));

-- ---------------------------------------------------------------------------
-- pins
-- ---------------------------------------------------------------------------

create table if not exists public.pinned_messages (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  pinned_by uuid not null references public.profiles (id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

alter table public.pinned_messages enable row level security;

drop policy if exists pins_select on public.pinned_messages;
create policy pins_select on public.pinned_messages
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists pins_insert on public.pinned_messages;
create policy pins_insert on public.pinned_messages
  for insert with check (
    pinned_by = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists pins_delete on public.pinned_messages;
create policy pins_delete on public.pinned_messages
  for delete using (
    pinned_by = auth.uid() or public.is_conversation_admin(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- drops
--
-- The signature feature: something thrown into a conversation for anyone to
-- answer, rather than a message aimed at one person.
-- ---------------------------------------------------------------------------

create table if not exists public.drops (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    check (kind in ('photo', 'video', 'voice', 'location', 'poll', 'question')),
  body text not null default '',
  media_path text,
  -- poll options, question deadline, location payload, etc.
  meta jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists drops_conversation_idx
  on public.drops (conversation_id, created_at desc);

create table if not exists public.drop_responses (
  drop_id uuid not null references public.drops (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null default '',
  option text,
  created_at timestamptz not null default now(),
  primary key (drop_id, user_id)
);

alter table public.drops enable row level security;
alter table public.drop_responses enable row level security;

drop policy if exists drops_select on public.drops;
create policy drops_select on public.drops
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists drops_insert on public.drops;
create policy drops_insert on public.drops
  for insert with check (
    author_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists drops_update on public.drops;
create policy drops_update on public.drops
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists drops_delete on public.drops;
create policy drops_delete on public.drops
  for delete using (
    author_id = auth.uid() or public.is_conversation_admin(conversation_id)
  );

drop policy if exists drop_responses_select on public.drop_responses;
create policy drop_responses_select on public.drop_responses
  for select using (
    exists (
      select 1 from public.drops d
      where d.id = drop_id
        and public.is_conversation_member(d.conversation_id)
    )
  );

drop policy if exists drop_responses_insert on public.drop_responses;
create policy drop_responses_insert on public.drop_responses
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.drops d
      where d.id = drop_id
        and public.is_conversation_member(d.conversation_id)
    )
  );

drop policy if exists drop_responses_update on public.drop_responses;
create policy drop_responses_update on public.drop_responses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- status wall
-- ---------------------------------------------------------------------------

create table if not exists public.status_updates (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('text', 'photo', 'video', 'voice', 'location')),
  body text not null default '',
  media_path text,
  meta jsonb not null default '{}'::jsonb,
  -- Statuses are temporary by definition; 24h is the default lifetime.
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now()
);

create index if not EXISTS status_updates_active_idx
  on public.status_updates (expires_at desc);

create table if not exists public.status_replies (
  id uuid primary key default gen_random_uuid(),
  status_id uuid not null references public.status_updates (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists status_replies_status_idx
  on public.status_replies (status_id, created_at);

alter table public.status_updates enable row level security;
alter table public.status_replies enable row level security;

-- Statuses are only visible to people who share a conversation with the
-- author. There are no public profiles by default.
drop policy if exists statuses_select on public.status_updates;
create policy statuses_select on public.status_updates
  for select using (
    author_id = auth.uid()
    or exists (
      select 1
      from public.conversation_members mine
      join public.conversation_members theirs
        on theirs.conversation_id = mine.conversation_id
      where mine.user_id = auth.uid() and theirs.user_id = status_updates.author_id
    )
  );

drop policy if exists statuses_insert on public.status_updates;
create policy statuses_insert on public.status_updates
  for insert with check (author_id = auth.uid());

drop policy if exists statuses_update on public.status_updates;
create policy statuses_update on public.status_updates
  for update using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists statuses_delete on public.status_updates;
create policy statuses_delete on public.status_updates
  for delete using (author_id = auth.uid());

drop policy if exists status_replies_select on public.status_replies;
create policy status_replies_select on public.status_replies
  for select using (
    exists (
      select 1 from public.status_updates s
      where s.id = status_id and s.expires_at > now()
    )
  );

drop policy if exists status_replies_insert on public.status_replies;
create policy status_replies_insert on public.status_replies
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.status_updates s
      where s.id = status_id and s.expires_at > now()
    )
  );

-- ---------------------------------------------------------------------------
-- squads
--
-- A squad is a named circle of people with its own conversation. It is a thin
-- layer over conversations rather than a parallel chat system.
-- ---------------------------------------------------------------------------

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.conversations (id) on delete cascade,
  name text not null,
  emoji text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.squads enable row level security;

drop policy if exists squads_select on public.squads;
create policy squads_select on public.squads
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists squads_insert on public.squads;
create policy squads_insert on public.squads
  for insert with check (
    owner_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists squads_update on public.squads;
create policy squads_update on public.squads
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists squads_delete on public.squads;
create policy squads_delete on public.squads
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  kind text check (kind in ('football', 'outing', 'meal', 'event', 'other')),
  starts_at timestamptz not null,
  location text,
  meta jsonb not null default '{}'::jsonb,
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.plan_responses (
  plan_id uuid not null references public.plans (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  response text not null check (response in ('going', 'maybe', 'cant')),
  created_at timestamptz not null default now(),
  primary key (plan_id, user_id)
);

alter table public.plans enable row level security;
alter table public.plan_responses enable row level security;

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans
  for select using (auth.role() = 'authenticated');

drop policy if exists plans_insert on public.plans;
create policy plans_insert on public.plans
  for insert with check (creator_id = auth.uid());

drop policy if exists plans_update on public.plans;
create policy plans_update on public.plans
  for update using (creator_id = auth.uid()) with check (creator_id = auth.uid());

drop policy if exists plans_delete on public.plans;
create policy plans_delete on public.plans
  for delete using (creator_id = auth.uid());

drop policy if exists plan_responses_select on public.plan_responses;
create policy plan_responses_select on public.plan_responses
  for select using (auth.role() = 'authenticated');

drop policy if exists plan_responses_insert on public.plan_responses;
create policy plan_responses_insert on public.plan_responses
  for insert with check (user_id = auth.uid());

drop policy if exists plan_responses_update on public.plan_responses;
create policy plan_responses_update on public.plan_responses
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- custom reactions
-- ---------------------------------------------------------------------------

create table if not exists public.custom_reactions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  emoji text not null,
  -- Optional label, e.g. "bro is finished".
  label text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (conversation_id, emoji)
);

alter table public.custom_reactions enable row level security;

drop policy if exists custom_reactions_select on public.custom_reactions;
create policy custom_reactions_select on public.custom_reactions
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists custom_reactions_insert on public.custom_reactions;
create policy custom_reactions_insert on public.custom_reactions
  for insert with check (
    created_by = auth.uid()
    and public.is_conversation_admin(conversation_id)
  );

drop policy if exists custom_reactions_delete on public.custom_reactions;
create policy custom_reactions_delete on public.custom_reactions
  for delete using (
    created_by = auth.uid() or public.is_conversation_admin(conversation_id)
  );

-- Reactions may point at a custom reaction instead of raw text.
alter table public.message_reactions
  add column if not exists custom_reaction_id uuid
    references public.custom_reactions (id) on delete set null;

alter table public.drop_responses
  add column if not exists reaction_emoji text;

-- ---------------------------------------------------------------------------
-- safety: blocks and mutes
-- ---------------------------------------------------------------------------

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.user_mutes (
  muter_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  muted_until timestamptz,
  created_at timestamptz not null default now(),
  primary key (muter_id, conversation_id)
);

alter table public.blocks enable row level security;
alter table public.user_mutes enable row level security;

-- Blocks are private: nobody, including the blocked user, sees them.
drop policy if exists blocks_select on public.blocks;
create policy blocks_select on public.blocks
  for select using (blocker_id = auth.uid());

drop policy if exists blocks_insert on public.blocks;
create policy blocks_insert on public.blocks
  for insert with check (blocker_id = auth.uid());

drop policy if exists blocks_delete on public.blocks;
create policy blocks_delete on public.blocks
  for delete using (blocker_id = auth.uid());

drop policy if exists user_mutes_select on public.user_mutes;
create policy user_mutes_select on public.user_mutes
  for select using (muter_id = auth.uid());

drop policy if exists user_mutes_insert on public.user_mutes;
create policy user_mutes_insert on public.user_mutes
  for insert with check (muter_id = auth.uid());

drop policy if exists user_mutes_delete on public.user_mutes;
create policy user_mutes_delete on public.user_mutes
  for delete using (muter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- message visibility
--
-- Disappearing and deleted messages must be invisible to everyone, including
-- the author, so the read policies filter them out rather than trusting the
-- client to hide them.
-- ---------------------------------------------------------------------------

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (
    public.is_conversation_member(conversation_id)
    and not deleted_for_everyone
    and (expires_at is null or expires_at > now())
  );

-- ---------------------------------------------------------------------------
-- realtime
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'drops', 'drop_responses', 'status_updates', 'status_replies',
    'pinned_messages', 'invites', 'message_reactions', 'plan_responses',
    'squads'
  ]
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

-- Presence and typing ride on broadcast channels, which need no publication.