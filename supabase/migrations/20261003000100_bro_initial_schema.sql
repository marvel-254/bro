-- BRO — initial schema
-- Postgres / Supabase. All user-facing tables live in public.
-- Identity comes from auth.users; with Clerk third-party auth the Clerk
-- "sub" claim becomes the Supabase user id, so auth.uid() works unchanged.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation
      and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_space_member(target_space uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.space_members sm
    where sm.space_id = target_space
      and sm.user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_admin(target_conversation uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation
      and cm.user_id = auth.uid()
      and cm.role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  display_name text not null default 'user',
  avatar_url text,
  bio text,
  status text not null default 'offline'
    check (status in ('online', 'offline', 'away')),
  is_verified boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'Public user profile, one row per auth user.';

-- Auto-create a profile the first time a user signs in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url, is_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, 'user'), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'user'), '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(new.email_confirmed_at, new.phone_confirmed_at) is not null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- spaces
-- ---------------------------------------------------------------------------

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  avatar_url text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.space_members (
  space_id uuid not null references public.spaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists space_members_user_idx
  on public.space_members (user_id);

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group', 'space', 'live')),
  name text,
  avatar_url text,
  space_id uuid references public.spaces (id) on delete set null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  is_pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  is_muted boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_idx
  on public.conversation_members (user_id);

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------

create table if not exists public.conversation_branches (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  root_message_id uuid,
  title text,
  created_by uuid not null references public.profiles (id) on delete cascade,
  message_count integer not null default 0,
  is_pinned boolean not null default false,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists branches_conversation_idx
  on public.conversation_branches (conversation_id, last_activity_at desc);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  content text not null default '',
  type text not null default 'text'
    check (type in ('text', 'image', 'file', 'voice')),
  status text not null default 'sent'
    check (status in ('pending', 'sending', 'sent', 'delivered', 'seen', 'failed')),
  reply_to_message_id uuid references public.messages (id) on delete set null,
  branch_id uuid references public.conversation_branches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists messages_branch_idx
  on public.messages (branch_id, created_at)
  where branch_id is not null;

create table if not exists public.message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists attachments_message_idx
  on public.attachments (message_id);

-- ---------------------------------------------------------------------------
-- activity and notifications
-- ---------------------------------------------------------------------------

create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  type text not null
    check (type in ('reply', 'mention', 'reaction', 'join', 'invite', 'follow')),
  actor_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid,
  target_type text
    check (target_type in ('conversation', 'message', 'space', 'user')),
  created_at timestamptz not null default now()
);

create index if not exists activity_created_idx
  on public.activity (created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activity (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_read boolean not null default false,
  deep_link text,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.spaces              enable row level security;
alter table public.space_members       enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_branches enable row level security;
alter table public.messages            enable row level security;
alter table public.message_reactions    enable row level security;
alter table public.attachments          enable row level security;
alter table public.activity             enable row level security;
alter table public.notifications       enable row level security;

-- profiles: public read, self write.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- spaces: public spaces readable, members readable, owner writes.
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces
  for select using (is_public or public.is_space_member(id) or owner_id = auth.uid());

drop policy if exists spaces_insert on public.spaces;
create policy spaces_insert on public.spaces
  for insert with check (owner_id = auth.uid());

drop policy if exists spaces_update on public.spaces;
create policy spaces_update on public.spaces
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists spaces_delete on public.spaces;
create policy spaces_delete on public.spaces
  for delete using (owner_id = auth.uid());

-- space_members: visible to fellow members; owner/admin manage.
drop policy if exists space_members_select on public.space_members;
create policy space_members_select on public.space_members
  for select using (public.is_space_member(space_id));

drop policy if exists space_members_insert on public.space_members;
create policy space_members_insert on public.space_members
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists space_members_update on public.space_members;
create policy space_members_update on public.space_members
  for update using (
    exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_id = auth.uid()
    )
  );

drop policy if exists space_members_delete on public.space_members;
create policy space_members_delete on public.space_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.spaces s
      where s.id = space_id and s.owner_id = auth.uid()
    )
  );

-- conversations: visible only to members.
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations
  for select using (public.is_conversation_member(id));

drop policy if exists conversations_insert on public.conversations;
create policy conversations_insert on public.conversations
  for insert with check (created_by = auth.uid());

drop policy if exists conversations_update on public.conversations;
create policy conversations_update on public.conversations
  for update using (public.is_conversation_admin(id));

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete using (public.is_conversation_admin(id) or created_by = auth.uid());

-- conversation_members: members read; admins manage (creator bootstraps self row).
drop policy if exists conversation_members_select on public.conversation_members;
create policy conversation_members_select on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists conversation_members_insert on public.conversation_members;
create policy conversation_members_insert on public.conversation_members
  for insert with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

drop policy if exists conversation_members_update on public.conversation_members;
create policy conversation_members_update on public.conversation_members
  for update using (
    user_id = auth.uid()
    or public.is_conversation_admin(conversation_id)
  );

drop policy if exists conversation_members_delete on public.conversation_members;
create policy conversation_members_delete on public.conversation_members
  for delete using (
    user_id = auth.uid()
    or exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.created_by = auth.uid()
    )
  );

-- branches: readable by conversation members.
drop policy if exists branches_select on public.conversation_branches;
create policy branches_select on public.conversation_branches
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists branches_insert on public.conversation_branches;
create policy branches_insert on public.conversation_branches
  for insert with check (
    created_by = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists branches_update on public.conversation_branches;
create policy branches_update on public.conversation_branches
  for update using (public.is_conversation_member(conversation_id));

drop policy if exists branches_delete on public.conversation_branches;
create policy branches_delete on public.conversation_branches
  for delete using (
    created_by = auth.uid()
    or public.is_conversation_admin(conversation_id)
  );

-- messages: readable by conversation members; senders write their own.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_conversation_member(conversation_id));

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update using (sender_id = auth.uid()) with check (sender_id = auth.uid());

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete using (
    sender_id = auth.uid()
    or public.is_conversation_admin(conversation_id)
  );

-- reactions: readable by conversation members via the parent message.
drop policy if exists reactions_select on public.message_reactions;
create policy reactions_select on public.message_reactions
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists reactions_insert on public.message_reactions;
create policy reactions_insert on public.message_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists reactions_delete on public.message_reactions;
create policy reactions_delete on public.message_reactions
  for delete using (user_id = auth.uid());

-- attachments: readable by conversation members; writers own the row.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select using (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert with check (
    exists (
      select 1 from public.messages m
      where m.id = message_id
        and m.sender_id = auth.uid()
        and public.is_conversation_member(m.conversation_id)
    )
  );

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete using (
    exists (
      select 1 from public.messages m
      where m.id = message_id and m.sender_id = auth.uid()
    )
  );

-- activity: readable by authenticated users, insertable by the actor.
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity
  for select using (auth.role() = 'authenticated');

drop policy if exists activity_insert on public.activity;
create policy activity_insert on public.activity
  for insert with check (actor_id = auth.uid());

-- notifications: strictly owner scoped.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Update events need the old row so clients can reconcile message status.
alter table public.messages replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_branches'
  ) then
    alter publication supabase_realtime add table public.conversation_branches;
  end if;
end $$;