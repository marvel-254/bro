-- BRO — close the PUBLIC execute grant hole
--
-- Migration 011 revoked EXECUTE from `anon` (and `authenticated` where
-- appropriate) on every SECURITY DEFINER function — and a live check then
-- showed anon could still call search_messages just fine.
--
-- Why: Supabase grants EXECUTE on new functions to PUBLIC by default, and
-- revoking from a single role does NOT remove access that still flows through
-- the PUBLIC grant. The DO-block revokes in 011 worked (prune_old_activity
-- correctly denies anon) only because they named `public` explicitly.
--
-- So: revoke from PUBLIC on the two client-callable functions, with explicit
-- grants back to the roles that need them. The is_* membership helpers stay
-- open to everyone on purpose — RLS policy evaluation requires EXECUTE even
-- for anon queries that should return [] rather than error.
--
-- Trigger bodies need no grants at all (system invocation) and keep only the
-- service_role grant from 011.

revoke execute on function public.search_messages(text, int) from public;
grant execute on function public.search_messages(text, int) to authenticated;
grant execute on function public.search_messages(text, int) to service_role;

revoke execute on function public.create_direct_conversation(uuid) from public;
grant execute on function public.create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_direct_conversation(uuid) to service_role;