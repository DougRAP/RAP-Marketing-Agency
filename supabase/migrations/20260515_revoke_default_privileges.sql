-- ============================================================
-- Revoke default privileges on public.* — enforce explicit grants today
-- Date: 2026-05-15
-- Owner: Doug Wright
--
-- Supabase will enforce "no implicit Data API exposure" on this
-- existing project starting 2026-10-30. By revoking the
-- default-privileges mechanism now, we make any future table
-- without explicit GRANTs (per docs/db-plan.md rule 6a) immediately
-- invisible to PostgREST — failure surfaces in the next PR instead
-- of five months from now.
--
-- Existing tables are unaffected: 20260514_data_api_grants.sql
-- already issued explicit grants for the 7 tables + 1 view in
-- public. This migration only kills the auto-grant pathway for
-- future objects.
--
-- Run after: 20260514_data_api_grants.sql
-- ============================================================

alter default privileges in schema public
  revoke all on tables    from anon, authenticated, service_role;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated, service_role;

alter default privileges in schema public
  revoke all on functions from anon, authenticated, service_role;
