-- ============================================================
-- Dashboard, onboarding, promotions, team seats
-- Date: 2026-05-18
-- Owner: Doug Wright
--
-- Extends 20260512_designer_plan_extensions.sql. New objects +
-- additive columns only. Run after the two prior migrations.
--
-- Reference: docs/dashboard-onboarding-plan.md
-- ============================================================

-- ------------------------------------------------------------
-- partners — additive columns for accounts, onboarding, admin
-- ------------------------------------------------------------
alter table public.partners
  add column if not exists account_number   text unique,
  add column if not exists account_type     text not null default 'designer_studio'
                             check (account_type in ('designer_studio', 'referral_contact')),
  add column if not exists lifecycle_status text not null default 'account_created'
                             check (lifecycle_status in (
                               'new_lead', 'account_created', 'code_sent', 'buy_now_link_sent',
                               'stripe_invited', 'stripe_complete', 'first_sale',
                               'active_partner', 'nurture'
                             )),
  add column if not exists assigned_agent        text,
  add column if not exists next_action_date      date,
  add column if not exists preferences           text,        -- agent-only, never shown to designer
  add column if not exists specializes_in        text[],      -- profiling: product categories
  add column if not exists avg_job_size          text,        -- profiling: range
  add column if not exists extra_profile_notes   text,        -- profiling: free-text "anything else"
  add column if not exists referred_by_partner_id uuid references public.partners(id) on delete set null,
  add column if not exists onboarding_step       smallint not null default 1;  -- 1..5, see PRD

create index if not exists partners_lifecycle_idx     on public.partners (lifecycle_status);
create index if not exists partners_assigned_idx      on public.partners (assigned_agent) where assigned_agent is not null;
create index if not exists partners_next_action_idx   on public.partners (next_action_date) where next_action_date is not null;
create index if not exists partners_referred_by_idx   on public.partners (referred_by_partner_id) where referred_by_partner_id is not null;

-- ------------------------------------------------------------
-- account number — human-readable, generated (DP-10001, ...)
-- ------------------------------------------------------------
create sequence if not exists public.account_number_seq start with 10001;

create or replace function public.assign_account_number()
returns trigger language plpgsql as $$
begin
  if new.account_number is null then
    new.account_number := 'DP-' || nextval('public.account_number_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists partners_assign_account_number on public.partners;
create trigger partners_assign_account_number
before insert on public.partners
for each row execute function public.assign_account_number();

-- backfill any existing rows
update public.partners
set account_number = 'DP-' || nextval('public.account_number_seq')
where account_number is null;

-- ------------------------------------------------------------
-- account_members — team seats. One account, many logins.
-- The owner invites and revokes.
-- ------------------------------------------------------------
create table if not exists public.account_members (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  auth_user_id uuid,                                  -- supabase auth.users.id once they accept
  email        citext not null,
  role         text not null default 'member' check (role in ('owner', 'member')),
  invited_by   uuid references public.partners(id),
  invited_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  unique (partner_id, email)
);

create index if not exists account_members_user_idx    on public.account_members (auth_user_id) where auth_user_id is not null;
create index if not exists account_members_partner_idx on public.account_members (partner_id);

-- ------------------------------------------------------------
-- promotions — launch promos
-- ------------------------------------------------------------
create table if not exists public.promotions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.promotions (code, name, description) values
  ('first-plan-on-us', 'First plan on us',
   'Designer claims on their first deal and names the client. Client pays full price; the designer''s commission on that deal is boosted to 40% (35% standard + 5%), capped at $5,000 of coverage value. One claim per account.'),
  ('refer-a-designer', 'Refer a designer',
   'Referrer earns a one-time 10% bonus commission on the referred designer''s first purchase. Repeatable across different referred designers.')
on conflict (code) do nothing;

-- ------------------------------------------------------------
-- promo_claims — a partner claiming a promotion
-- ------------------------------------------------------------
create table if not exists public.promo_claims (
  id                     uuid primary key default gen_random_uuid(),
  partner_id             uuid not null references public.partners(id) on delete cascade,
  promotion_id           uuid not null references public.promotions(id),
  promo_code             text not null,                          -- denormalized for the partial unique index below
  -- Promo A — "first plan on us"
  client_name            text,
  client_email           citext,
  commission_rate_applied numeric(4,3),                          -- e.g. 0.400
  -- Promo B — "refer a designer"
  referred_partner_id    uuid references public.partners(id) on delete set null,
  bonus_commission_cents integer check (bonus_commission_cents is null or bonus_commission_cents >= 0),
  -- shared
  order_id               uuid references public.orders(id) on delete set null,
  status                 text not null default 'claimed' check (status in (
                           'claimed', 'applied', 'expired', 'void'
                         )),
  claimed_at             timestamptz not null default now(),
  applied_at             timestamptz
);

create index if not exists promo_claims_partner_idx  on public.promo_claims (partner_id);
create index if not exists promo_claims_referred_idx on public.promo_claims (referred_partner_id) where referred_partner_id is not null;

-- Promo A is once per account; Promo B is repeatable. Enforce A with a partial unique index.
create unique index if not exists promo_claims_first_plan_once
  on public.promo_claims (partner_id)
  where promo_code = 'first-plan-on-us';

-- ------------------------------------------------------------
-- lookup_otps — code-lookup tier (no-password OTP verification)
-- A referral-code holder confirms ownership of the email/phone
-- on file. Codes are stored hashed and expire fast.
-- ------------------------------------------------------------
create table if not exists public.lookup_otps (
  id            uuid primary key default gen_random_uuid(),
  referral_code text not null,
  channel       text not null check (channel in ('email', 'sms')),
  destination   text not null,                       -- email or phone the OTP was sent to
  code_hash     text not null,                       -- hash of the 6-digit code, never the raw code
  expires_at    timestamptz not null,
  consumed_at   timestamptz,
  attempts      smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists lookup_otps_code_idx on public.lookup_otps (referral_code, created_at desc);

-- ------------------------------------------------------------
-- updated_at triggers
-- ------------------------------------------------------------
-- (partners already has one from the prior migration)

-- ------------------------------------------------------------
-- RLS — default deny. Service role (Netlify Functions) bypasses.
-- ------------------------------------------------------------
alter table public.account_members enable row level security;
alter table public.promotions      enable row level security;
alter table public.promo_claims    enable row level security;
alter table public.lookup_otps     enable row level security;

-- promotions: anyone may read active promos (dashboard renders them)
drop policy if exists "promotions_public_read" on public.promotions;
create policy "promotions_public_read"
  on public.promotions for select
  to anon, authenticated
  using (active = true);

-- account_members: a member may see the membership rows for accounts they belong to
drop policy if exists "account_members_self_read" on public.account_members;
create policy "account_members_self_read"
  on public.account_members for select
  to authenticated
  using (auth_user_id = auth.uid());

-- promo_claims: a partner may read their own claims
drop policy if exists "promo_claims_self_read" on public.promo_claims;
create policy "promo_claims_self_read"
  on public.promo_claims for select
  to authenticated
  using (
    partner_id in (
      select partner_id from public.account_members where auth_user_id = auth.uid()
      union
      select id from public.partners where auth_user_id = auth.uid()
    )
  );

-- lookup_otps: no public policies — service role only.

-- ------------------------------------------------------------
-- admin view refresh — extend admin_leads_view with the new
-- partner fields so the onboarding console can show them.
-- ------------------------------------------------------------
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
  p.id                as partner_id,
  p.account_number,
  p.account_type,
  p.status            as partner_status,
  p.lifecycle_status,
  p.assigned_agent,
  p.next_action_date,
  p.referral_code,
  p.onboarding_step,
  (select source     from public.lead_events e where e.lead_id = l.id order by e.created_at desc limit 1) as last_event_source,
  (select event_type from public.lead_events e where e.lead_id = l.id order by e.created_at desc limit 1) as last_event_type,
  (select created_at from public.lead_events e where e.lead_id = l.id order by e.created_at desc limit 1) as last_event_at,
  l.created_at,
  l.updated_at
from public.leads l
left join public.partners p on p.lead_id = l.id;

comment on view public.admin_leads_view is
  'Sales/onboarding-team read view. Leads joined to partner account + most-recent event.';
