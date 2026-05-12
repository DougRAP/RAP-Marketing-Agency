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

### Ingestion path — always the same

```
Browser form → Netlify Function → Supabase (service-role key, server-side) → upsert leads + insert lead_events
```

The browser never talks to Supabase directly for writes. Each Netlify Function uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) and must stay server-side. The shared client is `designer-plan-site/netlify/functions/_supabase.js`; the marketing-center function inlines the same pattern because it's the only function in that site.

When adding a new form/webhook, follow the existing function pattern: validate input → honeypot check (`body.hp`) → upsert `leads` on `email` conflict → insert a `lead_events` row with the appropriate `source` value → optionally add to an `email_lists` membership. See `designer-plan-site/netlify/functions/popup-capture.js` as the canonical example.

### Known `lead_events.source` values

`whitepaper-request`, `designer-sign-up` (rap-public-site), `landing_popup`, `plans_credit_capture`, `partner_application`, `cart_started`, `plan_purchase` (designer-plan-site). Extend by adding new string values — no schema change required.

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
