# Designer Protection Plan — Lead Database Plan

For: Adrian (developer)
Owner: Doug Wright
Status: Draft for review — not yet implemented

## Goal

Capture every inbound lead from the public marketing site into a single Supabase Postgres database, in a shape that:

1. The Designer Programs sales team can work from today (export to CSV, or a thin read-only dashboard).
2. A future MCP server / agent can read and act on programmatically (auto-welcome email, Stripe account provisioning, follow-up sequencing) without sales-team involvement.
3. Will extend cleanly when **thedesignerplan.com** ships with consult bookings and direct purchase.

## Lead sources

| # | Source | Form name (Netlify) | Status |
|---|---|---|---|
| 1 | White paper download | `whitepaper-request` | live |
| 2 | Designer sign-up | `designer-sign-up` | live |
| 3 | Consult booking (Calendly) | n/a — webhook | future |
| 4 | Direct plan purchase (Stripe) | n/a — webhook | future |
| 5 | Designer-on-behalf-of-client purchase | n/a — webhook | future |

The schema below is built so #3–#5 slot in as additional `source_type` values without restructuring.

## Form fields captured today

**whitepaper-request** — `name`, `email`, `phone`, `firm` (optional)

**designer-sign-up** — `name`, `company`, `email`, `phone`, `address`, `average_project_size`, `clients_per_year`, `notes` (optional)

(See `rap-public-site/whitepaper/index.html` and `rap-public-site/sign-up/index.html` for the source of truth.)

## Schema

Two tables. One `leads` table for the person + identity. One `lead_events` table for everything that happens to or about that person — submissions, calls, purchases, status changes. This keeps `leads` slim and avoids schema churn every time we add a form or a workflow step.

### `leads`

```sql
create table public.leads (
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

create index leads_status_created_idx on public.leads (status, created_at desc);
create index leads_owner_idx on public.leads (owner) where owner is not null;
```

Notes:
- `email` is the natural key. `citext` so case differences don't create dupes.
- `status` enum-via-check is intentional — it's easier to ALTER than a Postgres enum type.
- Don't store `name`, `phone`, etc. on every event — they belong to the person.

### `lead_events`

```sql
create table public.lead_events (
  id            bigserial primary key,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  event_type    text not null,              -- see below
  source        text not null,              -- 'whitepaper-request', 'designer-sign-up', 'calendly', 'stripe', 'manual', etc.
  payload       jsonb not null default '{}', -- the raw form/webhook body, minus PII duplicated on `leads`
  notes         text,                       -- free-text for sales-rep entries
  created_by    text,                       -- system identifier or user email
  created_at    timestamptz not null default now()
);

create index lead_events_lead_idx on public.lead_events (lead_id, created_at desc);
create index lead_events_type_idx on public.lead_events (event_type, created_at desc);
create index lead_events_payload_gin on public.lead_events using gin (payload);
```

Event types (extend as needed):

| event_type | When |
|---|---|
| `form_submitted` | Inbound form (white paper, sign-up) |
| `consult_booked` | Calendly webhook |
| `consult_completed` | Sales rep marks done |
| `purchase` | Stripe webhook (success) |
| `refund` | Stripe webhook |
| `note` | Sales rep free-form note |
| `status_changed` | Status transition (audit) |
| `email_sent` | Outbound automation |

The `payload` jsonb keeps the original webhook/form body verbatim — invaluable for debugging and means we never lose data we forgot to schematize.

### `updated_at` trigger

```sql
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger leads_touch_updated_at
before update on public.leads
for each row execute function public.touch_updated_at();
```

## Ingestion path

```
Netlify form submit
  ↓
Netlify Function (e.g. /netlify/functions/lead-capture)
  ↓
Supabase REST API, using SERVICE_ROLE key (server-side only)
  ↓
upsert leads (on conflict (email)) + insert lead_events
```

**Why a Netlify Function and not a direct browser → Supabase insert:**
- The browser can't safely hold the service role key.
- We don't want to expose an `anon` key with insert privileges on `leads` to the public — even with RLS, that's a footgun.
- The function can also normalize input, deduplicate by email, attach UTM/referrer headers, and validate before insert.

Netlify already captures form submissions natively, so the function is a **submission-created** webhook handler — no front-end changes required. Configure it under Netlify → Site settings → Build & deploy → Post processing → Form notifications → Outgoing webhook.

Pseudocode for the function:

```ts
// netlify/functions/lead-capture.ts
export default async (req: Request) => {
  const body = await req.json();
  const { form_name, data } = body;

  const lead = {
    email: data.email.toLowerCase().trim(),
    full_name: data.name,
    phone: data.phone,
    company: data.firm ?? data.company,
    address: data.address,
    average_project_size: data.average_project_size,
    clients_per_year: data.clients_per_year,
  };

  // Upsert lead (creates or updates; never duplicates on email)
  const { data: leadRow } = await supabase
    .from("leads")
    .upsert(lead, { onConflict: "email" })
    .select()
    .single();

  // Append the form submission as an event
  await supabase.from("lead_events").insert({
    lead_id: leadRow.id,
    event_type: "form_submitted",
    source: form_name,
    payload: data,
  });

  return new Response("ok");
};
```

Env vars on Netlify: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. **Service role key never goes in client JS or in a public env var.**

## Access for the sales team (today)

The sales team should not be in Supabase Studio. Two clean options, pick one:

**Option A — CSV export from a Supabase view** (simplest, free)
- Create a `sales_leads_view` that joins `leads` to a `last_event_at`/`last_event_type` aggregate.
- Sales team gets a Supabase user with `select` on the view only.
- Export to CSV from Studio when needed.

**Option B — Read-only dashboard** (~½ day to build)
- A small protected page in `rap-public-site` (or a separate Netlify site) using Supabase Auth for sales-team logins.
- Lists leads with filters (status, owner, source), inline status update, "add note" button (writes a `note` event).
- This becomes the foundation for the sales console long-term.

Recommendation: ship A on day one, build B once Adrian sees how the team actually uses the data.

**HTML download for the sales team** — Doug to clarify with Adrian what specifically needs to download: a CSV export of leads, or a per-lead detail HTML? Both are easy from a view; the deliverable depends on the workflow.

## Security checklist

- [ ] **RLS enabled on both tables.** Default-deny policies, then explicit allows.
- [ ] **No `anon` insert/update/delete on `leads` or `lead_events`** — all writes go through the Netlify Function with the service role key.
- [ ] **Service role key only in Netlify env vars**, never in the repo, never in client JS.
- [ ] **Authenticated read policy on a `sales_leads_view`** scoped to users with a `sales` role (custom JWT claim or a `sales_users` table referenced in the policy).
- [ ] **Webhook signing** for the Netlify form webhook — Netlify supports HMAC signatures; verify in the function.
- [ ] **Rate limit / honeypot** is already in the forms; the function should also reject submissions where the honeypot field is filled.
- [ ] **Postgres backups** on a paid Supabase tier before storing real PII at scale.
- [ ] **PII handling** — addresses and phone numbers are PII. Document retention policy. If we ever ship to EU, a `consent_at` and `consent_source` column on `leads` becomes load-bearing — add it now if there's any chance: `consent_at timestamptz, consent_text text`.
- [ ] **Audit log** — keep `lead_events` immutable (no updates, no deletes) so the history is tamper-evident. Enforce with an RLS policy that denies UPDATE/DELETE on `lead_events` to all roles except a dedicated maintenance role.

## Future: auto-deploy without the sales team

The end-state Doug described — "deploy without the sales team" — means automated handoff to whatever the sales team does manually today. With this schema, that's a sequence of triggers on `lead_events`:

1. **`form_submitted` from `whitepaper-request`** → send white paper email + start a 3-touch nurture sequence (Postmark, Resend, or EmailOctopus API).
2. **`form_submitted` from `designer-sign-up`** → create Stripe Connect account onboarding link, email it to the designer, set status → `qualified`.
3. **`consult_booked` from Calendly** → drop into a Slack channel, attach lead history.
4. **`purchase` from Stripe** → status → `customer`, kick off coverage paperwork generation, attach PDF to a new event.

Implementation options:
- **Supabase Edge Functions + database webhooks** — trigger an Edge Function on every `lead_events` insert, dispatch on `event_type`. Stays in one platform.
- **n8n / Zapier** — visual workflow tool; faster for the sales team to read and modify, slower at runtime, more moving parts.
- **A dedicated automation worker** (e.g. a tiny Node service on Fly.io or Render) that subscribes to Supabase Realtime — most flexibility, most ops.

Recommendation for v1: **Supabase Edge Functions**. One platform, one set of credentials, no extra hosting.

## MCP server (later)

When Doug wants Claude / another agent to act on this database directly, the MCP server is a thin wrapper around a few Postgres reads and a small number of safe writes. Suggested tools:

- `find_lead(email | name | phone)` → returns lead + last 10 events
- `add_note(lead_id, text)` → inserts a `note` event
- `update_status(lead_id, new_status)` → updates `leads.status` and inserts a `status_changed` event
- `list_new_leads(since, source?)` → filtered query for triage
- `summarize_lead(lead_id)` → server-side compose, since LLMs are bad at long event lists

Build this on top of the same Supabase project using a dedicated `mcp` Postgres role with narrowly scoped grants — never let the MCP server hold the service-role key.

## Operations and boundaries — please read

This project is hosted as **three separate Netlify sites built from one GitHub repo** (`DougRAP/RAP-Marketing-Agency`). Each site has its own publish directory and its own Netlify project. **Do not consolidate, restructure, or migrate them.** This separation is intentional and load-bearing.

| Netlify site | Publish directory in repo | Purpose | Notes |
|---|---|---|---|
| `rap-designer-programs` (public) | `rap-public-site/` | The public marketing site (DPP landing, white paper, sign-up forms) | Production. Indexed. |
| `rap-marketing-center` (internal) | `marketing-center-site/` | Internal email-staging tool — sales/marketing previews each weekly email and downloads the HTML for EmailOctopus | `/private/*` is gated by HTTP Basic Auth via `marketing-center-site/_headers`. **Do not remove the gate.** |
| `designer-assets` (CDN) | `designer-assets-site/` | Public image host for email assets (the emails reference these URLs directly) | Image filenames must remain stable — emails already in flight reference these paths. |

The new lead-capture work (Netlify Function + Supabase) belongs to the **public site** (`rap-public-site/`). The marketing-center and designer-assets sites should not be touched.

### Working agreement

To keep this manageable for Doug long-term, please follow these rules:

1. **All changes go through this GitHub repo and the existing three Netlify projects.** No new Netlify accounts, no new Netlify projects, no parallel infrastructure under a different owner. If something genuinely needs a fourth site, raise it with Doug first.
2. **No edits in the Netlify UI that aren't reflected in the repo.** Don't edit HTML/redirects/headers from the Netlify dashboard. Everything ships from the repo so Doug retains source-of-truth.
3. **Don't change deploy settings, build commands, publish directories, or branch-deploy rules** without telling Doug. The current `main`-branch fast-forward deploy flow is what he relies on.
4. **Don't change ownership, transfer projects, or add team-wide admins** on Netlify, GitHub, or Supabase. If you need access, Doug will grant it scoped to what you need.
5. **Supabase project will be owned by Doug.** Adrian gets a developer role with admin in the project, but the org owner is Doug. Same pattern Doug uses for Netlify and GitHub.
6. **Migrations checked into the repo.** Use `supabase db diff` / `supabase migration` so every schema change is visible in PRs. Studio is fine for exploration; production schema changes go through migrations.
7. **Secrets live in Netlify env vars, never in the repo.** That includes `SUPABASE_SERVICE_ROLE_KEY`, any future Stripe keys, etc. Document each new env var in this file when you add it so the list stays current.
8. **Branch + PR for non-trivial changes.** Doug has been merging via fast-forward push to `main` for small content edits, but anything touching forms, functions, schema, or auth should go through a PR Doug can review before it deploys.

### Sales-team HTML download

The marketing-center site at `rap-marketing-center.netlify.app/private/` is what the sales/marketing team uses to download the weekly EmailOctopus-ready HTML. **It must keep working** when the lead-capture changes ship. Specifically:

- Don't add a build step to the public site that affects the other two sites' deploys.
- If a Netlify Function is added, scope it to the public site only.
- After your first deploy, smoke-test that the marketing-center private page still loads, the Week 1 preview still renders, and the "download" button on each week still serves the correct file.

## Open questions for Doug

1. Should the sales team see white-paper downloaders, or only sign-up leads? (Today's plan: yes, both, but tagged by source so a rep can ignore the lower-intent downloaders.)
2. What's the desired "HTML download" deliverable — CSV of leads, or per-lead detail page?
3. Retention policy — how long do we keep leads who never convert?
4. Consent text on the forms — current copy says "We will only use your contact information to..." which is fine, but if we add a `consent_at`/`consent_text` column we need to commit to a specific version that's stored alongside.

## Open questions for Adrian

1. Sales team auth — Supabase Auth with magic links, or do they already have a Google/Microsoft tenant we should SSO into?
2. Where should the Netlify Function live in the repo — new `netlify/functions/` at the root, or inside `rap-public-site/`?
3. Preference for migrations — Supabase CLI migrations checked into the repo, or DDL applied through Studio for now?

---

## Addendum — 2026-05-12 — Designer Plan extensions

A fourth Netlify site (`designer-plan-site/`) was added to the monorepo for **thedesignerplan.com** — the landing page + plans page + partner-application + cart flow. It uses the same Supabase project as the public site. Migration: `supabase/migrations/20260512_designer_plan_extensions.sql`.

### What was added (additive only — Adrian's `leads` + `lead_events` schema is unchanged)

| Object | Purpose |
|---|---|
| `leads.consent_at`, `leads.consent_text` | Resolves the open question in this doc. Recorded on every form submit. |
| `public.partners` | One row per approved/pending partner studio. `lead_id` FK to `leads` (1:1). Holds `commission_rate`, `referral_code`, `stripe_account_id`, `status`. |
| `public.plans` | Reference table for the three coverage tiers, seeded. |
| `public.orders` | Plan purchases. FK to `lead_id` (buyer) and `partner_id` (commission recipient). |
| `public.email_lists`, `public.email_list_members` | Curated marketing lists, with optional `emailoctopus_id` for sync. |
| `public.admin_leads_view` | Read view for the marketing-center admin UI — joins `leads` + `partners` + last event. |

New `lead_events.source` values used by designer-plan-site functions:
`landing_popup`, `plans_credit_capture`, `partner_application`, `cart_started`, `plan_purchase` (future).

### Ingestion path matches Adrian's pattern

All writes go through Netlify Functions in `designer-plan-site/netlify/functions/`, using the `SUPABASE_SERVICE_ROLE_KEY` env var server-side. No browser → Supabase writes. Functions in this set:

| Function | Triggered by | What it does |
|---|---|---|
| `popup-capture` | landing-page popup form | upsert lead, log `form_submitted` event, add to `designers-all` list |
| `partner-apply` | `/partner-apply` form | upsert lead, upsert `partners` row (status pending), log event, add to `designers-pending` list |
| `cart-checkout` | cart drawer "Proceed" button | stub today; logs `cart_started` event when partner-attributed |

The marketing-center site also gained a function for the admin UI:

| Function | UI | What it does |
|---|---|---|
| `admin-leads` | `/private/lists/` | overview, member listing, lead search, add/remove members, CSV export, create-list |

### Operational rules — preserved

- No changes to existing Netlify sites' publish/build settings.
- The marketing-center site needs its **Functions Directory** set in the Netlify dashboard (one-time) to enable `admin-leads.js`. This is the only new dashboard change — see `designer-plan-site/DEPLOY.md`.
- New site (`designer-plan-site`) is a sibling, not a consolidation. The doc's "raise it first" rule was honored: Doug approved the fourth site explicitly before scaffold.
- All secrets remain in Netlify env vars — no keys in the repo.
- Migrations are checked in (`supabase/migrations/20260512_*.sql`).

### Open question now answered

> Consent text on the forms — current copy says "We will only use your contact information to..." which is fine, but if we add a `consent_at`/`consent_text` column we need to commit to a specific version that's stored alongside.

Resolved. `leads.consent_at` and `leads.consent_text` columns added. Every form on designer-plan-site posts the current consent string as a hidden field; the function stores it on the lead row.
