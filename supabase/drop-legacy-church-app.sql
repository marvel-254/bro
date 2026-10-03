-- BRO — one-time reset of the legacy church-app schema
--
-- WHY THIS EXISTS
--   The Gmail Supabase project (xmdyovfcjogkarwxiyhb) previously hosted the
--   abandoned `church-app`. Its tables collide with BRO's schema: it already
--   has `profiles` (with a mandatory church_id FK) and `notifications`.
--   BRO's migration uses `create table if not exists`, so it would silently
--   skip those two and leave the app bound to the wrong column shape at
--   runtime instead of failing loudly at migration time.
--
--   The owner confirmed the church app is dead, so this drops the public
--   schema contents and lets BRO's migration install cleanly.
--
-- DESTRUCTIVE AND IRREVERSIBLE. Every table listed here loses its data.
--   auth.* and storage.* live in their own schemas and are NOT touched, so
--   user accounts and uploaded files survive.
--
-- HOW TO RUN
--   psql "$DATABASE_URL" -f supabase/drop-legacy-church-app.sql
--   or paste into Dashboard -> SQL Editor and run once.
--
-- This file is intentionally NOT in supabase/migrations/, so it never runs
-- automatically. Apply BRO's migration afterwards:
--   supabase db push

begin;

-- Drop everything in the public schema. CASCADE removes the tables that
-- depend on profiles / notifications (ministries, events, sermons,
-- attendance, giving_entries, and so on).
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> 'spatial_ref_sys'
  loop
    execute format('drop table if exists public.%I cascade;', r.tablename);
    raise notice 'dropped public.%', r.tablename;
  end loop;
end $$;

-- Drop the legacy signup trigger on auth.users so BRO's handle_new_user()
-- can be installed. Auth rows themselves are preserved.
drop trigger if exists on_auth_user_created on auth.users;

-- Remove now-orphaned helper functions from the old app.
drop function if exists public.handle_new_user() cascade;

-- Clear the realtime publication so BRO's migration can re-add its tables.
do $$
declare
  r record;
begin
  for r in
    select tablename
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table public.%I;', r.tablename);
  end loop;
end $$;

commit;

-- Verify: this should return zero rows.
select tablename from pg_tables where schemaname = 'public';