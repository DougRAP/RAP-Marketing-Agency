# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo shape — read this first

This is a **monorepo of four static Netlify sites** plus a shared Supabase schema. Each top-level site directory is the publish root of a separate Netlify project, all built from the same GitHub repo (`DougRAP/RAP-Marketing-Agency`). **This separation is intentional and load-bearing — do not consolidate or restructure.** See `docs/db-plan.md` "Operations and boundaries — please read" for the full working agreement.

| Directory | Netlify site | Purpose |
|---|---|---|
| `rap-public-site/` | `rap-designer-programs` | Public marketing site (DPP landing, white paper, sign-up) |
| `marketing-center-site/` | `rap-marketing-center` | Internal email-staging tool. `/private/*` is **HTTP Basic Auth gated** via `marketing-center-site/_headers` — do not remove the gate |
| `designer-assets-site/` | `designer-assets` | Public image CDN for emails. Filenames are stable — in-flight emails reference these paths |
| `designer-plan-site/` | (site #4 for thedesignerplan.com) | Landing + plans + partner-apply + cart |

The root `package.json` exists only so all four sites' Netlify Functions can share `@supabase/supabase-js` from a single hoisted `node_modules`. There is **no build step** — all sites are plain static HTML/CSS/JS.

## Architecture: lead capture is the spine

Every inbound submission across all four sites flows into one Supabase Postgres database, modeled in `docs/db-plan.md`. The shape is two tables — `leads` (one row per person, keyed by `email citext`) and `lead_events` (append-only history of every form submit, webhook, note, status change). Schema lives in `supabase/migrations/`:

- `20260511_base_schema.sql` — `leads` + `lead_events` + `touch_updated_at` trigger. **Run first.**
- `20260512_designer_plan_extensions.sql` — additive only: `partners`, `plans`, `orders`, `email_lists`, `email_list_members`, `admin_leads_view`, plus `leads.consent_at` / `leads.consent_text`.
- `20260514_data_api_grants.sql` — explicit table-level `GRANT`s for the 8 public objects. Required because Supabase removed implicit Data API exposure on `public.*` (enforced 2026-10-30 on existing projects; this repo adopted the strict regime on 2026-05-14).
- `20260515_revoke_default_privileges.sql` — kills the auto-grant pathway so any new table without explicit grants is immediately invisible to PostgREST. See **Supabase grants — explicit, today** below.

### Ingestion path — always the same

```
Browser form → Netlify Function → Supabase (service-role key, server-side) → upsert leads + insert lead_events
```

The browser never talks to Supabase directly for writes. Each Netlify Function uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) and must stay server-side. The shared client is `designer-plan-site/netlify/functions/_supabase.js`; the marketing-center function inlines the same pattern because it's the only function in that site.

When adding a new form/webhook, follow the existing function pattern: validate input → honeypot check (`body.hp`) → upsert `leads` on `email` conflict → insert a `lead_events` row with the appropriate `source` value → optionally add to an `email_lists` membership. See `designer-plan-site/netlify/functions/popup-capture.js` as the canonical example.

### Known `lead_events.source` values

`whitepaper-request`, `designer-sign-up` (rap-public-site), `landing_popup`, `plans_credit_capture`, `partner_application`, `cart_started`, `plan_purchase` (designer-plan-site). Extend by adding new string values — no schema change required.

## Supabase grants — explicit, today

**Explicit table grants are mandatory in every new migration.** This project enforces the strict Data API regime **today**, not at Supabase's 2026-10-30 cutover deadline. Default-privileges auto-grants are revoked at the DB layer (`supabase/migrations/20260515_revoke_default_privileges.sql`), so any new table created without explicit grants in its own migration is immediately invisible to PostgREST. Failure surfaces in the next PR, not five months from now.

Pattern, placed right after every `create table public.<t>` plus its `alter table ... enable row level security` line:

```sql
grant select, insert, update, delete on public.<t> to service_role;
grant select on public.<t> to authenticated;   -- only if logged-in users read it from the browser
grant select on public.<t> to anon;            -- only if anonymous public pages read it
grant usage, select on sequence public.<seq> to service_role;  -- only if bigserial
```

Rules:

- **`service_role`** always gets full CRUD on operational tables — the Netlify Functions path needs it. Use `select, insert` only for append-only tables (precedent: `public.lead_events`, line 79).
- **`authenticated`** is granted only when a logged-in user reads the table directly from the browser via the anon SDK + their JWT. Always pair with an RLS policy that narrows rows by `auth.uid()` (precedents: `partners_self_read`, `orders_partner_read` in `supabase/migrations/20260512_designer_plan_extensions.sql`).
- **`anon`** is an architecture call worth flagging in the PR. The repo has exactly one anon-readable object today (`public.plans`, for the public plans page on `rap-public-site`). Adding another is fine but deliberate.
- **Never use `alter default privileges`** to "fix grants" — keep grants explicit and co-located with the table they cover. The repo's `20260515` migration already revoked the default-privileges pathway; re-enabling it would silently mask missing grants.
- RLS is the per-row gate; grants are the per-table gate. Both are required for Data API exposure.

See `docs/db-plan.md` rule 6a for the same convention with rationale.

## Common commands

```bash
# Install shared deps (runs from repo root; used by Netlify Functions across all sites)
npm install

# Local dev for a site with functions (designer-plan-site, marketing-center-site)
cd designer-plan-site
netlify dev --dir . --functions netlify/functions

# Static-only preview (rap-public-site, designer-assets-site)
# — just open the index.html in a browser

# Apply Supabase migrations
supabase db push
# Or paste each migration SQL into Supabase Studio in order
```

There are no tests, no linter, and no build script. Validation happens at deploy time on Netlify.

## Deploy / Netlify settings (do NOT edit in the dashboard ad-hoc)

Per the working agreement in `docs/db-plan.md`:

- All four sites deploy from `main` (fast-forward) — no branch-deploy rules.
- Build command is empty; publish directory matches the site folder (e.g., `designer-plan-site`).
- Functions directory must be set per-site in the Netlify dashboard (one-time):
  - `designer-plan-site/netlify/functions`
  - `marketing-center-site/netlify/functions` (originally had no functions — see `designer-plan-site/DEPLOY.md` for the one-time toggle)
- Env vars per function-bearing site: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optionally `EMAILOCTOPUS_API_KEY`.
- **Don't edit HTML, redirects, headers, or build settings from the Netlify UI** — the repo is the source of truth.

## Things to know before touching code

- **Marketing-center `/private/*` Basic Auth is non-negotiable.** It gates the admin lists UI (`/private/lists/`) which calls `admin-leads.js` with no other auth layer. The function trusts the gate.
- **The admin lists UI** (`marketing-center-site/private/lists/index.html` + `admin-leads.js`) uses query-string `?mode=overview|list|leads|export` for GETs and `op` in POST body (`add`, `remove`, `create_list`).
- **`designer-plan-site` cart** is client-side localStorage (`dp_cart_v1` key); `cart-checkout.js` is currently a stub — real Stripe checkout is dev-team TODO.
- **`designer-plan-site/js/auth.js`** sets `window.DP_AUTH`. Real Supabase auth is commented out; the partner-mode commission banner is gated by `?partner=1` for dev previews.
- **Consent capture**: every new form must POST `consent_text` (the literal copy shown to the user); the function writes `consent_at` + `consent_text` on the `leads` row.
- **Honeypot field**: forms include a hidden field; functions silently 200 when `body.hp` is truthy. Preserve this.
- **`lead_events` is meant to be append-only / immutable** — never `UPDATE` or `DELETE` rows there. Status changes are recorded as new `status_changed` events.

## Pre-launch placeholders

`designer-plan-site/` has several `REPLACE-BEFORE-LAUNCH` / `[REVIEW]` / `$[XX]` / placeholder Unsplash hero images marked in `DEPLOY.md`. Don't ship those to production without swapping.

## Reference docs in the repo

- `docs/db-plan.md` — schema rationale, ingestion design, security checklist, operational rules, working agreement (read this for any cross-site or schema-touching work)
- `designer-plan-site/DEPLOY.md` — Netlify + Supabase setup for site #4, smoke tests, dev-team handoff TODOs
- `designer-plan-site/README.md` — funnel flow and `designer-plan-site/` structure overview
