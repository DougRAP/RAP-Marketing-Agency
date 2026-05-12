-- ============================================================
-- Designer Plan extensions to the shared leads schema
-- Date: 2026-05-12
-- Owner: Doug Wright
--
-- Extends the leads + lead_events model defined in docs/db-plan.md
-- (Adrian's schema). DO NOT REPLACE THOSE TABLES — this file assumes
-- they already exist. New objects only.
--
-- Sources captured here:
--   - landing_popup             (designer-plan-site popup)
--   - plans_credit_capture      (plans page "Use my $5,000 credit")
--   - partner_application       (designer-plan-site /partner-apply)
--   - cart_started              (analytic event from cart.js)
--   - plan_purchase             (Stripe webhook, future)
-- ============================================================

-- ---- consent capture on leads (Adrian flagged this as TODO) ----
alter table public.leads
  add column if not exists consent_at   timestamptz,
  add column if not exists consent_text text;

-- ---- partner-specific data, 1:1 with a lead ----
create table if not exists public.partners (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null unique references public.leads(id) on delete cascade,
  auth_user_id      uuid unique,                          -- supabase auth.users.id once they log in
  studio_name       text,
  referral_code     text unique,
  commission_rate   numeric(4,3) not null default 0.350,  -- 0.000 - 1.000
  stripe_account_id text,
  status            text not null default 'pending' check (status in (
                      'pending', 'approved', 'rejected', 'suspended'
                    )),
  approved_at       timestamptz,
  rejected_reason   text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists partners_status_idx     on public.partners (status);
create index if not exists partners_referral_idx   on public.partners (referral_code) where referral_code is not null;
create index if not exists partners_auth_user_idx  on public.partners (auth_user_id) where auth_user_id is not null;

create trigger partners_touch_updated_at
before update on public.partners
for each row execute function public.touch_updated_at();

-- ---- plans reference table (the three tiers) ----
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text,
  price_cents integer not null check (price_cents >= 0),
  active      boolean not null default true,
  sort_order  smallint not null default 0,
  created_at  timestamptz not null default now()
);

insert into public.plans (slug, name, tagline, price_cents, sort_order) values
  ('tier-one',   'Stain Protection',         'Common household stains. 36 months.',                    14900, 1),
  ('tier-two',   'Premium Protection',       'Adds rips, tears, burns, electrical.',                   24900, 2),
  ('tier-three', 'Premium Plus Protection',  'Adds frames, structural, motion mechanisms.',            34900, 3)
on conflict (slug) do update set
  name        = excluded.name,
  tagline     = excluded.tagline,
  price_cents = excluded.price_cents,
  sort_order  = excluded.sort_order;

-- ---- orders (plan purchases) ----
create table if not exists public.orders (
  id                  uuid primary key default gen_random_uuid(),
  lead_id             uuid references public.leads(id) on delete set null,    -- buyer (designer or client)
  partner_id          uuid references public.partners(id) on delete set null, -- commission recipient
  plan_id             uuid not null references public.plans(id),
  customer_email      citext not null,
  price_cents         integer not null check (price_cents >= 0),
  commission_cents    integer not null default 0 check (commission_cents >= 0),
  currency            text not null default 'USD',
  status              text not null default 'pending' check (status in (
                        'pending', 'paid', 'refunded', 'cancelled', 'failed'
                      )),
  stripe_session_id   text unique,
  stripe_payment_id   text,
  is_complimentary    boolean not null default false, -- the "first plan on us" benefit
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists orders_partner_idx  on public.orders (partner_id) where partner_id is not null;
create index if not exists orders_status_idx   on public.orders (status, created_at desc);
create index if not exists orders_lead_idx     on public.orders (lead_id) where lead_id is not null;

create trigger orders_touch_updated_at
before update on public.orders
for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS
-- Default deny on all new tables. Service role (used by Netlify
-- Functions) bypasses RLS, so writes flow through the function path.
-- ============================================================

alter table public.partners enable row level security;
alter table public.plans    enable row level security;
alter table public.orders   enable row level security;

-- plans: anyone may read (the public plans page renders them)
drop policy if exists "plans_public_read" on public.plans;
create policy "plans_public_read"
  on public.plans
  for select
  to anon, authenticated
  using (active = true);

-- partners: a partner may read their own row
drop policy if exists "partners_self_read" on public.partners;
create policy "partners_self_read"
  on public.partners
  for select
  to authenticated
  using (auth_user_id = auth.uid());

-- orders: a partner may read orders attributed to them
drop policy if exists "orders_partner_read" on public.orders;
create policy "orders_partner_read"
  on public.orders
  for select
  to authenticated
  using (
    partner_id in (
      select id from public.partners where auth_user_id = auth.uid()
    )
  );

-- ============================================================
-- Helper view for the marketing-center admin list page.
-- Joins leads with last event + partner status flag.
-- ============================================================
create or replace view public.admin_leads_view as
select
  l.id,
  l.email,
  l.full_name,
  l.company,
  l.phone,
  l.status,
  l.owner,
  l.consent_at,
  p.id          as partner_id,
  p.status      as partner_status,
  p.referral_code,
  (select source     from public.lead_events e where e.lead_id = l.id order by e.created_at desc limit 1) as last_event_source,
  (select event_type from public.lead_events e where e.lead_id = l.id order by e.created_at desc limit 1) as last_event_type,
  (select created_at from public.lead_events e where e.lead_id = l.id order by e.created_at desc limit 1) as last_event_at,
  l.created_at,
  l.updated_at
from public.leads l
left join public.partners p on p.lead_id = l.id;

comment on view public.admin_leads_view is
  'Sales/marketing-team-facing read view. Joins leads, partner record, and most-recent event.';

-- ============================================================
-- Email list management (for the marketing-center admin page)
-- Thin tables. The actual broadcasts go through EmailOctopus;
-- these tables let staff curate which leads end up on which list.
-- ============================================================

create table if not exists public.email_lists (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  description     text,
  emailoctopus_id text,                                 -- the corresponding list id in EmailOctopus, if synced
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger email_lists_touch_updated_at
before update on public.email_lists
for each row execute function public.touch_updated_at();

create table if not exists public.email_list_members (
  list_id     uuid not null references public.email_lists(id) on delete cascade,
  lead_id     uuid not null references public.leads(id) on delete cascade,
  added_at    timestamptz not null default now(),
  added_by    text,
  primary key (list_id, lead_id)
);

create index if not exists email_list_members_lead_idx on public.email_list_members (lead_id);

-- Seed default lists
insert into public.email_lists (slug, name, description) values
  ('designers-all',      'Designers — all',           'Every designer captured across both sites'),
  ('designers-partners', 'Designers — approved',      'Approved program partners'),
  ('designers-pending',  'Designers — pending',       'Applied but not yet approved'),
  ('clients-direct',     'Clients — direct buyers',   'Non-designer customers who bought a plan')
on conflict (slug) do nothing;

alter table public.email_lists enable row level security;
alter table public.email_list_members enable row level security;
-- No public policies — service role only (admin page reads via a Netlify Function).
