-- ---------------------------------------------------------------------------
-- 016: self-hosted GIF library
--
-- WhatsApp-style GIF sending, served from a corpus we own rather than a
-- third-party API. Nothing is proxied and no provider key ships in the client:
-- the catalogue lives in Postgres and the files live in a public bucket.
--
-- Why a catalogue table instead of listing the bucket: bucket listing cannot
-- search. Search is the whole point of a GIF picker, and doing it in SQL keeps
-- it fast, typo-tolerant and free.
--
-- A GIF message references a catalogue row (gif_id) rather than an
-- attachments row, because attachments describe per-message *uploads* into
-- chat-media that validate_media_upload() has sniffed. A library GIF was never
-- uploaded by the sender, so pretending otherwise would mean either skipping
-- that validation or lying to it.
-- ---------------------------------------------------------------------------

-- Public: GIFs are library content, not user uploads. Nothing private here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gifs', 'gifs', true, 8388608, array['image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.gif_library (
  id uuid primary key default gen_random_uuid(),
  -- Path inside the `gifs` bucket. Unique so a re-upload replaces rather than
  -- duplicating, and so the client can derive a stable URL.
  storage_path text not null unique,
  title text not null default '',
  -- Lowercased, space-separated. Searched with a trigram/ilike combination.
  tags text not null default '',
  width int not null default 0,
  height int not null default 0,
  size_bytes bigint not null default 0,
  -- Admin-only curation flag. Unlisted entries stay servable but are skipped
  -- by the default picker listing.
  is_listed boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists gif_library_listed_idx
  on public.gif_library (is_listed, created_at desc);

-- Trigram matching needs pg_trgm; without it search falls back to the ilike
-- path in the client, which is fine on a small corpus.
create extension if not exists pg_trgm;

create index if not exists gif_library_title_trgm_idx
  on public.gif_library using gin (title gin_trgm_ops);

create index if not exists gif_library_tags_idx
  on public.gif_library using gin (tags gin_trgm_ops);

alter table public.gif_library enable row level security;

-- The library is readable by any signed-in user: it is shared content, and the
-- picker has nothing to hide. Writes are not granted to the client at all --
-- curation happens out of band, so there is deliberately no insert/update
-- policy. A public bucket plus no write policy means the catalogue is
-- append-only by whoever holds the service role, and read-only to everyone.
drop policy if exists gif_library_select on public.gif_library;
create policy gif_library_select on public.gif_library
  for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- messages: GIFs
--
-- `gif` joins the type union alongside text/image/file/voice. Existing rows are
-- untouched, and `gif_id` is nullable so every other message type is unaffected.
-- ---------------------------------------------------------------------------

alter table public.messages
  drop constraint if exists messages_type_check;

alter table public.messages
  add constraint messages_type_check
  check (type in ('text', 'image', 'file', 'voice', 'gif'));

alter table public.messages
  add column if not exists gif_id uuid references public.gif_library (id) on delete set null;

-- A gif message must name its gif, and nothing else may.
alter table public.messages
  drop constraint if exists messages_gif_shape_check;

alter table public.messages
  add constraint messages_gif_shape_check
  check (
    (type = 'gif' and gif_id is not null)
    or (type <> 'gif' and gif_id is null)
  );

-- Nobody may point a message at a catalogue entry that is not listed, so a
-- delisted GIF cannot be smuggled back into a conversation by id guessing.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
    and not public.blocks_between(sender_id, auth.uid())
    and (
      gif_id is null
      or exists (select 1 from public.gif_library g where g.id = gif_id and g.is_listed)
    )
  );
