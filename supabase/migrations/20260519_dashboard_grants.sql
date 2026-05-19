-- ============================================================
-- Data API GRANTs for the dashboard/onboarding objects
-- Date: 2026-05-19
-- Owner: Adrian Barres
--
-- 20260518_dashboard_onboarding.sql created 4 tables, 1 sequence,
-- and recreated admin_leads_view -- but emitted no GRANT statements.
-- With 20260515_revoke_default_privileges.sql already active, those
-- objects return 42501 to PostgREST/GraphQL. This migration emits
-- the explicit grants required by docs/db-plan.md rule 6a.
--
-- Role conventions (per CLAUDE.md "Supabase grants -- explicit, today"):
--   service_role  = full CRUD on operational tables; Netlify Functions
--   authenticated = SELECT only; paired with RLS policies in 20260518
--   anon          = SELECT only on genuinely public objects (active promos)
--
-- Idempotent (re-granting an existing privilege is a no-op).
-- Run after: 20260518_dashboard_onboarding.sql
-- Apply via: supabase db push
-- ============================================================

-- anon: read active promotions for the public/preview dashboard
grant select on public.promotions to anon;

-- authenticated: self-service reads (RLS policies narrow rows)
grant select on public.account_members to authenticated;  -- account_members_self_read
grant select on public.promotions       to authenticated;  -- promotions_public_read
grant select on public.promo_claims     to authenticated;  -- promo_claims_self_read

-- service_role: full CRUD; Netlify Functions handle all writes
grant select, insert, update, delete on public.account_members to service_role;
grant select, insert, update, delete on public.promotions       to service_role;
grant select, insert, update, delete on public.promo_claims     to service_role;
grant select, insert, update, delete on public.lookup_otps      to service_role;

-- sequence: the partners_assign_account_number trigger calls nextval()
-- on insert; only service_role inserts into public.partners (per 20260514).
grant usage, select on sequence public.account_number_seq to service_role;

-- admin_leads_view: CREATE OR REPLACE VIEW preserves grants in Postgres,
-- so the 20260514 grant should have survived the recreation in 20260518.
-- Re-issuing defensively so this migration is self-documenting.
grant select on public.admin_leads_view to service_role;
