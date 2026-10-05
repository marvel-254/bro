-- BRO — profile interests column
--
-- The profile-setup wizard collects interests and updateProfile writes them
-- to auth metadata only. profiles has no interests column, so they vanish on
-- any read from profiles. Add the column; metadata remains the backup copy.

alter table public.profiles
  add column if not exists interests text[] not null default '{}';

comment on column public.profiles.interests is
  'Self-declared interest tags from profile setup. Auth metadata keeps a copy; this column is the read source.';
