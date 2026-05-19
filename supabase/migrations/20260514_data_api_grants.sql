-- ============================================================
-- Data API GRANTs for public.* tables
-- Date: 2026-05-14
-- Owner: Doug Wright
--
-- Supabase's PostgREST-backed Data API enforces TWO gates:
--   1. table-level GRANTs (postgres privilege system)
--   2. row-level security policies
-- 20260511 and 20260512 set up RLS correctly but never issued the
-- underlying GRANTs. Effective 2026-10-30 on this existing project,
-- any new table without explicit grants will return 42501 to the
-- Data API. This migration fixes the grants for the 7 tables + 1
-- view already in public; RLS remains the row-level gate.
--
-- Idempotent (re-granting an existing privilege is a no-op).
-- Run after: 20260512_designer_plan_extensions.sql
-- Apply via: supabase db push  (see designer-plan-site/DEPLOY.md)
-- ============================================================

-- anon: public read of active plans only
grant select on public.plans to anon;

-- authenticated: partner self-service reads (RLS narrows the rows)
grant select on public.plans     to authenticated;
grant select on public.partners  to authenticated;
grant select on public.orders    to authenticated;

-- service_role: full CRUD on operational tables (Netlify Functions)
grant select, insert, update, delete on public.leads               to service_role;
grant select, insert                  on public.lead_events         to service_role;
grant select, insert, update, delete on public.partners            to service_role;
grant select, insert, update, delete on public.plans               to service_role;
grant select, insert, update, delete on public.orders              to service_role;
grant select, insert, update, delete on public.email_lists         to service_role;
grant select, insert, update, delete on public.email_list_members  to service_role;
grant select                          on public.admin_leads_view    to service_role;

-- sequences (only bigserial in the schema)
grant usage, select on sequence public.lead_events_id_seq to service_role;
