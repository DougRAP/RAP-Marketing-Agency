-- ============================================================
-- Base schema — leads + lead_events
-- Date: 2026-05-11
-- Owner: Doug Wright
--
-- This is the schema described in docs/db-plan.md by Adrian. It
-- captures every inbound lead from any RAP marketing surface into
-- a single Supabase Postgres database. The designer-plan extensions
-- (20260512_*) assume these tables already exist.
--
-- Run this BEFORE 20260512_designer_plan_extensions.sql.
-- ============================================================

-- Required extensions
create extension if not exists "pgcrypto";  -- for gen_random_uuid()
create extension if not exists "citext";    -- for case-insensitive email

-- ============================================================
-- leads
-- One row per person. Email is the natural key (citext).
-- ============================================================
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  full_name     text,
  phone         text,
  company       text,
  address       text,
  -- soft attributes; nullable so they can be filled in over time
  average_project_size  text,
  clients_per_year      text,
  -- lifecycle
  status        text not null default 'new' check (status in (
                  'new', 'contacted', 'qualified', 'partner', 'customer', 'unresponsive', 'archived'
                )),
  owner         text,                       -- assigned sales rep email
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);
create index if not exists leads_owner_idx          on public.leads (owner) where owner is not null;

-- ============================================================
-- lead_events
-- Append-only stream of everything that happens to a lead.
-- ============================================================
create table if not exists public.lead_events (
  id            bigserial primary key,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  event_type    text not null,
  source        text not null,
  payload       jsonb not null default '{}',
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now()
);

create index if not exists lead_events_lead_idx        on public.lead_events (lead_id, created_at desc);
create index if not exists lead_events_type_idx        on public.lead_events (event_type, created_at desc);
create index if not exists lead_events_payload_gin_idx on public.lead_events using gin (payload);

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists leads_touch_updated_at on public.leads;
create trigger leads_touch_updated_at
before update on public.leads
for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS — default deny. Writes flow through Netlify Functions
-- using the service role key (which bypasses RLS).
-- ============================================================
alter table public.leads       enable row level security;
alter table public.lead_events enable row level security;

-- (No explicit policies yet — service role bypasses RLS for writes.
-- A future sales-team read policy will be added when that UI ships.)
