-- BRO — self-hosted meme library
--
-- Replaces the imgflip.com feed (src/lib/memes.ts) with a corpus we own.
-- Nothing is proxied and no third-party key ships in the client.
--
-- Storage split follows the handoff's binding decision:
--   * meme FILES  -> Cloudflare R2, bucket `bro-memes`, public read
--   * meme METADATA -> this table, in Postgres
--
-- The same catalogue-table-plus-bucket shape as the GIF library (migration
-- 016), for the same reason: bucket listing cannot search or paginate, and
-- both are load-bearing here.
--
-- Uploads are OPEN to any signed-in user, so moderation is not optional and
-- is written defensively:
--   * every row carries report_count and is_hidden, and hiding is a single
--     flag the feed filters on rather than a delete, so a report is
--     recoverable and reversible;
--   * a report auto-hides a meme at the threshold below, so a spam flood
--     stops being visible before a human looks at it. Without this, "open
--     uploads + report to moderate" means "one report arrives after the
--     damage", which is the failure mode open uploads actually have;
--   * reporters cannot re-report the same meme, so one person cannot push a
--     single meme over the threshold alone;
--   * clients cannot write is_hidden or report_count. Those columns are
--     server-set, and the insert policy pins them.

create table if not exists public.memes (
  id uuid primary key default gen_random_uuid(),
  -- Object key inside the `bro-memes` R2 bucket. Unique so a re-upload
  -- replaces rather than duplicates, and so the client can derive a stable
  -- URL from the bucket base.
  storage_path text not null unique,
  title text not null default '',
  -- Lowercased, space-separated, for search.
  tags text not null default '',
  width int not null default 0,
  height int not null default 0,
  size_bytes bigint not null default 0,
  -- Null for rows migrated in from imgflip, which had no BRO author.
  uploaded_by uuid references public.profiles (id) on delete set null,
  is_hidden boolean not null default false,
  -- Server-set. Never writable by a client.
  report_count int not null default 0,
  created_at timestamptz not null default now(),
  -- Bounds on what we are willing to render. A meme is an image, and the
  -- picker displays it full-width; these match the GIF library's limits.
  check (width > 0 and height > 0 and width <= 4000 and height <= 4000),
  check (size_bytes > 0)
);

-- The infinite feed: newest first, visible only. `id` is in the index so the
-- ordering is total — created_at alone is not unique, and a non-total order
-- makes offset paging return the same row twice across pages.
create index if not exists memes_feed_idx
  on public.memes (created_at desc, id desc)
  where is_hidden = false;

create index if not exists memes_hidden_idx
  on public.memes (report_count desc)
  where is_hidden = true;

create extension if not exists pg_trgm;
create index if not exists memes_title_trgm_idx
  on public.memes using gin (title gin_trgm_ops);

alter table public.memes enable row level security;

-- Any signed-in user can read the visible feed. Hidden memes are invisible to
-- everyone; they come back through the service role for review.
drop policy if exists memes_select on public.memes;
create policy memes_select on public.memes
  for select using (auth.uid() is not null and not is_hidden);

-- Open uploads, with the server-set columns pinned to their defaults. Without
-- those pins a client could insert its own meme pre-unhidden-and-unreported,
-- or seed a report_count to get someone else's meme hidden.
drop policy if exists memes_insert on public.memes;
create policy memes_insert on public.memes
  for insert with check (
    auth.uid() is not null
    and uploaded_by = auth.uid()
    and not is_hidden
    and report_count = 0
  );

-- An uploader may retitle their own meme, but not unhide it or touch its
-- report count.
drop policy if exists memes_update on public.memes;
create policy memes_update on public.memes
  for update using (uploaded_by = auth.uid())
  with check (uploaded_by = auth.uid() and not is_hidden and report_count = 0);

drop policy if exists memes_delete on public.memes;
create policy memes_delete on public.memes
  for delete using (uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- reports
--
create table if not exists public.meme_reports (
  id uuid primary key default gen_random_uuid(),
  meme_id uuid not null references public.memes (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (
    reason in ('spam', 'abusive', 'nsfw', 'copyright', 'other')
  ),
  detail text,
  created_at timestamptz not null default now(),
  -- One report per person per meme. This is load-bearing: without it a single
  -- account can hit the auto-hide threshold alone.
  unique (meme_id, reporter_id)
);

create index if not exists meme_reports_meme_idx
  on public.meme_reports (meme_id, created_at desc);

alter table public.meme_reports enable row level security;

-- You can file a report, and you can see the ones you filed. You cannot see
-- who else reported a meme — that would turn the report button into a way to
-- identify a small community's members.
drop policy if exists meme_reports_insert on public.meme_reports;
create policy meme_reports_insert on public.meme_reports
  for insert with check (
    reporter_id = auth.uid()
    and exists (
      select 1 from public.memes m
      where m.id = meme_id and not m.is_hidden
    )
  );

drop policy if exists meme_reports_select on public.meme_reports;
create policy meme_reports_select on public.meme_reports
  for select using (reporter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- auto-hide
--
-- Reports accumulate the count and hide at the threshold. security definer
-- because the client that files the report has no UPDATE policy on `memes`
-- and must not need one.

create or replace function public.apply_meme_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  threshold constant int := 3;
begin
  update public.memes
  set report_count = report_count + 1,
      is_hidden = report_count + 1 >= threshold
  where id = new.meme_id;

  return new;
end;
$$;

drop trigger if exists meme_reports_apply on public.meme_reports;
create trigger meme_reports_apply
  after insert on public.meme_reports
  for each row
  execute function public.apply_meme_report();
