-- BRO — media storage
--
-- Creates the four buckets from docs/research/media-storage-deep-spec.md and
-- gives them real Storage RLS. Until now `attachments` existed as a table but
-- there was nowhere to put a file, so media was impossible.
--
-- Security posture, matching the spec:
--
--   * Only `avatars` is public-read. A profile picture is the one thing that
--     genuinely needs to be readable by anyone.
--   * `chat-media`, `voice-notes` and `statuses` are private. Reads go through
--     short-lived signed URLs issued only to people who are allowed to see them.
--   * Writes are owner-path-scoped: the first path segment must be the caller's
--     own uid, so one user can never write into another user's folder even if
--     they guess a path.
--   * The server NEVER trusts a client-declared MIME type. Storage policies can
--     only inspect the bucket-level metadata, so per-type enforcement happens in
--     validate_media_upload(), which sniffs magic bytes before writing the
--     attachments row. The size limit is enforced in two places on purpose:
--     bucket-level so Storage rejects it, and in code so the user gets a real
--     error instead of a generic one.

-- ---------------------------------------------------------------------------
-- Relax attachments so it can describe media with no message yet
-- ---------------------------------------------------------------------------

-- Chat media always has a message. Avatars and statuses do not, so the column
-- has to become nullable rather than forcing a fake message row.
alter table public.attachments
  drop constraint if exists attachments_message_id_fkey;

alter table public.attachments
  add column if not exists uploader uuid references public.profiles (id) on delete set null;

alter table public.attachments
  add column if not exists bucket text not null default 'chat-media';

alter table public.attachments
  add column if not exists thumb_path text;

alter table public.attachments
  add column if not exists width integer;

alter table public.attachments
  add column if not exists height integer;

alter table public.attachments
  alter column message_id drop not null;

-- Backfill uploader from the message author so existing rows keep an owner.
update public.attachments a
   set uploader = m.sender_id
  from public.messages m
 where m.id = a.message_id
   and a.uploader is null;

create index if not exists attachments_uploader_idx
  on public.attachments (uploader, created_at desc);

create index if not exists attachments_bucket_path_idx
  on public.attachments (bucket, storage_path);

-- ---------------------------------------------------------------------------
-- Buckets
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',      'avatars',      true,   2097152,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-media',   'chat-media',   false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']),
  ('voice-notes',  'voice-notes',  false,  5242880,
   array['audio/m4a', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/webm']),
  ('statuses',     'statuses',     false,  8388608,
   array['image/jpeg', 'image/png', 'image/webp', 'video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- avatars: public read, owner write
-- ---------------------------------------------------------------------------

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- chat-media: conversation members only
--
-- The first path segment is the conversation id, so membership can be checked
-- from the path itself.
-- ---------------------------------------------------------------------------

drop policy if exists "chat media read for members" on storage.objects;
create policy "chat media read for members"
  on storage.objects for select
  using (
    bucket_id = 'chat-media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "chat media insert for members" on storage.objects;
create policy "chat media insert for members"
  on storage.objects for insert
  with check (
    bucket_id = 'chat-media'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "chat media delete own" on storage.objects;
create policy "chat media delete own"
  on storage.objects for delete
  using (
    bucket_id = 'chat-media'
    and owner_id = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- voice-notes: same shape as chat-media
-- ---------------------------------------------------------------------------

drop policy if exists "voice notes read for members" on storage.objects;
create policy "voice notes read for members"
  on storage.objects for select
  using (
    bucket_id = 'voice-notes'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "voice notes insert for members" on storage.objects;
create policy "voice notes insert for members"
  on storage.objects for insert
  with check (
    bucket_id = 'voice-notes'
    and public.is_conversation_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "voice notes delete own" on storage.objects;
create policy "voice notes delete own"
  on storage.objects for delete
  using (
    bucket_id = 'voice-notes'
    and owner_id = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- statuses: readable by people you share a conversation with
--
-- There is no conversation id in the status path, so this falls back to "shares
-- a conversation with the owner", reusing the peers table. Not a full friends
-- graph, but it is the same honest interim Who's Around uses.
-- ---------------------------------------------------------------------------

drop policy if exists "statuses read for peers" on storage.objects;
create policy "statuses read for peers"
  on storage.objects for select
  using (
    bucket_id = 'statuses'
    and exists (
      select 1
      from public.conversation_members mine
      join public.conversation_members theirs
        on theirs.conversation_id = mine.conversation_id
       and theirs.user_id = ((storage.foldername(name))[1])::uuid
      where mine.user_id = auth.uid()
      limit 1
    )
  );

drop policy if exists "statuses insert own" on storage.objects;
create policy "statuses insert own"
  on storage.objects for insert
  with check (
    bucket_id = 'statuses'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "statuses delete own" on storage.objects;
create policy "statuses delete own"
  on storage.objects for delete
  using (
    bucket_id = 'statuses'
    and owner_id = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- attachments RLS
-- ---------------------------------------------------------------------------

alter table public.attachments enable row level security;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments
  for select using (
    -- Attached to a message you can see, or it is your own upload.
    (message_id is not null and exists (
      select 1 from public.messages m
      where m.id = attachments.message_id
        and public.is_conversation_member(m.conversation_id)
    ))
    or uploader = auth.uid()
  );

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert with check (uploader = auth.uid());

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments
  for delete using (
    uploader = auth.uid()
    or exists (
      select 1 from public.messages m
      where m.id = attachments.message_id
        and public.is_conversation_admin(m.conversation_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

-- Removing a message must not leave an orphan file behind. Storage cannot be
-- cleaned from a row trigger without elevated rights, so this only removes the
-- bookkeeping row; the object itself is swept by the function below.
create or replace function public.sweep_orphan_media()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  swept integer;
begin
  -- attachments whose message is gone, older than a day so an in-flight
  -- upload-then-attach sequence is never caught mid-way.
  delete from public.attachments
  where message_id is null
    and uploader is not null
    and created_at < now() - interval '1 day'
    and bucket = 'chat-media';

  get diagnostics swept = row_count;
  return swept;
end;
$$;

comment on function public.sweep_orphan_media() is
  'Removes attachment rows for chat media that never got attached to a message.
   Deletes the bookkeeping row only -- actually deleting the storage object
   needs the storage API, so schedule this alongside an object sweep. Not
   scheduled yet.';