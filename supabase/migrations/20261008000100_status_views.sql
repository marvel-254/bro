-- BRO — status views
--
-- "Viewed by" on a status, the way WhatsApp shows it. A view is recorded when
-- someone actually opens the story, not when it loads into their tray: a tray
-- load is passive, and counting it would inflate every number on the screen.
--
-- Model notes:
--   * One row per (status, viewer). Re-opening a status updates viewed_at
--     rather than adding a second row, so the count is people, not opens.
--     The client upserts, but the primary key is what makes it true.
--   * A viewer never sees themselves in the list, and never sees anyone else
--     for a status they cannot see. Both are enforced by RLS below rather than
--     by the client, because a viewer list is exactly the sort of thing that
--     leaks when it is trusted to the UI.
--   * Visibility is deliberately written as "can see the status" rather than
--     as a second copy of the conversation-membership rule. If the status
--     feed later moves to the follows graph (see docs/HANDOFF-statuses-memes.md),
--     the viewer list follows automatically instead of drifting out of sync.

create table if not exists public.status_views (
  status_id uuid not null references public.status_updates (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  primary key (status_id, viewer_id)
);

-- Reading a status' viewers is per-status, so the index leads with status_id.
-- Newest view first is what the UI shows.
create index if not exists status_views_recent_idx
  on public.status_views (status_id, last_viewed_at desc);

alter table public.status_views enable row level security;

-- You may read the viewers of a status you can see, minus yourself.
drop policy if exists status_views_select on public.status_views;
create policy status_views_select on public.status_views
  for select using (
    viewer_id <> auth.uid()
    and exists (
      select 1 from public.status_updates s
      where s.id = status_id and s.expires_at > now()
    )
  );

-- You may only record a view of a status you can see, and only as yourself.
-- The visibility subquery is the point: without it this is a write oracle that
-- confirms whether an arbitrary status id exists.
drop policy if exists status_views_insert on public.status_views;
create policy status_views_insert on public.status_views
  for insert with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.status_updates s
      where s.id = status_id and s.expires_at > now()
    )
  );

-- Re-opening updates the timestamp only. `using` keeps the row owned by the
-- same viewer, and the `with check` stops a client rewriting someone else's.
drop policy if exists status_views_update on public.status_views;
create policy status_views_update on public.status_views
  for update using (viewer_id = auth.uid())
  with check (viewer_id = auth.uid());
