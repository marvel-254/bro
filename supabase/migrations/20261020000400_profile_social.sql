-- ---------------------------------------------------------------------------
-- Profile social summary
--
-- The profile screen shows follower/following counts. `follows_select` only
-- exposes edges the caller is an endpoint of, so a plain count from the client
-- always returns 0 or 1 for anyone else. Counts are public information on a
-- profile, so this reads them with security definer and exposes only numbers.
-- ---------------------------------------------------------------------------

create or replace function public.profile_social_summary(p_user_id uuid)
returns table (follower_count integer, following_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer
       from public.follows f
      where f.followee_id = p_user_id) as follower_count,
    (select count(*)::integer
       from public.follows f
      where f.follower_id = p_user_id) as following_count;
$$;

revoke all on function public.profile_social_summary(uuid) from public;
grant execute on function public.profile_social_summary(uuid) to authenticated;
