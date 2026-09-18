-- ============================================================
-- partner_clients: prospects the designer adds from the dashboard
-- Date: 2026-09-18
-- Owner: Adrian Barres
--
-- Contract F of designer-plan-site/docs/dashboard-data-contract.md.
-- A prospect lives here; a sale lives in SOAR. The clients page joins
-- both on client_email (citext, so case never breaks the join).
-- Status is derived from link_sent_at plus the engine's sales and is
-- never stored.
--
-- Writes go through Netlify Functions (client-add.js, client-send-link.js)
-- with the service role. The browser only reads its own rows.
--
-- Grants are explicit and co-located, per CLAUDE.md "Supabase grants".
-- Run after: 20260519_dashboard_grants.sql. Apply via: supabase db push.
-- ============================================================

create table if not exists public.partner_clients (
  id               uuid primary key default gen_random_uuid(),
  partner_id       uuid not null references public.partners(id) on delete cascade,
  client_name      text not null,
  project_name     text,
  client_email     citext not null,
  client_phone     text,
  notes            text,
  link_sent_at     timestamptz,
  link_sent_count  integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint partner_clients_partner_email_key unique (partner_id, client_email)
);

create index if not exists partner_clients_partner_idx on public.partner_clients (partner_id);

-- updated_at trigger, same function as leads / partners / orders
drop trigger if exists partner_clients_touch_updated_at on public.partner_clients;
create trigger partner_clients_touch_updated_at
before update on public.partner_clients
for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- RLS: a partner reads only their own prospects. No insert or
-- update policy for the browser; writes go through functions.
-- ------------------------------------------------------------
alter table public.partner_clients enable row level security;

drop policy if exists "partner_clients_select_own" on public.partner_clients;
create policy "partner_clients_select_own"
  on public.partner_clients for select
  to authenticated
  using (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
  );

-- ------------------------------------------------------------
-- Data API grants (table-level gate; RLS is the row-level gate)
-- ------------------------------------------------------------
grant select, insert, update, delete on public.partner_clients to service_role;
grant select on public.partner_clients to authenticated;
revoke all on public.partner_clients from anon;
