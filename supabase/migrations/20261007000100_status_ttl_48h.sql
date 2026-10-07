-- Statuses now live for 48 hours instead of 24.

alter table public.status_updates
  alter column expires_at set default (now() + interval '48 hours');

-- One-time backfill: anything already posted and still alive gets its full
-- new lifetime rather than expiring half-way through what the UI promises.
update public.status_updates
  set expires_at = created_at + interval '48 hours'
  where expires_at > now();
