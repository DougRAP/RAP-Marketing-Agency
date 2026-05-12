# Designer Plan — deploy guide

Site #4 in the `RAP-Marketing-Agency` monorepo. Publishes from `designer-plan-site/`.

## What this site is

| | |
|---|---|
| Repo | `DougRAP/RAP-Marketing-Agency` (existing) |
| Local path | `designer-plan-site/` (new) |
| Pages | `/`, `/plans`, `/about`, `/partnership`, `/terms`, `/privacy`, `/login`, `/partner-apply` |
| Functions | `designer-plan-site/netlify/functions/` (popup-capture, partner-apply, cart-checkout) |
| Database | Same Supabase project as the public marketing site |
| Email | EmailOctopus — lists managed in the marketing-center admin UI |

## One-time Netlify setup

> Per `docs/db-plan.md`, deploy settings live in the Netlify dashboard, not in committed `netlify.toml` files. The steps below follow the same pattern as the existing three sites.

1. **Create the site** — Netlify dashboard → "Add new site" → "Import from Git" → pick `DougRAP/RAP-Marketing-Agency`.
2. **Site settings → Build & deploy → Build settings:**
   - Base directory: *(leave blank)*
   - Build command: *(leave blank — static site)*
   - **Publish directory:** `designer-plan-site`
   - **Functions directory:** `designer-plan-site/netlify/functions`
3. **Site settings → Build & deploy → Branches:** deploy from `main` only (fast-forward, matching the existing three sites).
4. **Domain settings → custom domain:** add `thedesignerplan.com` (or whatever final domain is chosen). Netlify auto-provisions Let's Encrypt.
5. **Site settings → Environment variables:** add
   - `SUPABASE_URL` — from the Supabase project's API page
   - `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase project's API page (**server-side only — never exposed in client JS**)
   - `EMAILOCTOPUS_API_KEY` — *(optional, for when list-sync is wired)*

## One-time Supabase setup

1. Run the migration on the existing Supabase project (same project the public marketing site uses):
   ```bash
   # via Supabase CLI
   supabase db push
   # or via Studio: paste the SQL from supabase/migrations/20260512_designer_plan_extensions.sql
   ```
2. Verify the new tables exist: `partners`, `plans`, `orders`, `email_lists`, `email_list_members`.
3. Verify the new view exists: `admin_leads_view`.
4. Confirm seed plans loaded (three rows in `public.plans`).

## marketing-center-site changes (also needs a one-time toggle)

The admin lists page lives at `https://rap-marketing-center.netlify.app/private/lists/`. It calls a new Netlify Function. The marketing-center site previously had no functions, so:

1. Netlify dashboard → marketing-center site → Build & deploy → set **Functions directory** to `marketing-center-site/netlify/functions`.
2. Add the same env vars as the designer-plan site (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Local development

Static HTML — open `designer-plan-site/index.html` directly in a browser to preview the landing page. For function testing locally:

```bash
cd designer-plan-site
netlify dev --dir . --functions netlify/functions
```

This serves the static site at http://localhost:8888 with functions live.

## Pre-launch placeholders to swap

- `designer-plan-site/index.html` — hero `<img>` is a placeholder Unsplash URL marked `REPLACE-BEFORE-LAUNCH`. Swap for licensed photography.
- `designer-plan-site/plans/index.html` — hero photo same note.
- `designer-plan-site/index.html` — testimonial block is marked `Placeholder — replace before launch`. Swap for a real designer quote and attribution.
- `designer-plan-site/index.html`, `plans/index.html` — tier prices show `$[XX]` — swap for actual pricing. Cart prices in `plans/index.html` are placeholder `data-price-cents` values (14900, 24900, 34900).
- `designer-plan-site/terms/index.html`, `privacy/index.html` — sections marked `[REVIEW]` need legal sign-off.

## After deploy — smoke tests

1. Marketing-center private page still loads at `/private/` and the weekly downloads still work (do not regress per the db-plan operational rules).
2. `/` renders, popup fires at 20s or 40% scroll, submission writes a row to `leads` and a row to `lead_events` with `source='landing_popup'`.
3. `/plans` renders, "Add to cart" opens the cart drawer, item persists on reload (localStorage).
4. `/plans?partner=1` shows the partner-mode commission banner in the cart (dev preview only — strip the query in production once real auth is wired).
5. `/partner-apply` submission writes a `leads` row, a `partners` row with `status='pending'`, and a `lead_events` row with `source='partner_application'`.
6. `/private/lists/` on the marketing-center site shows the four seeded email lists with member counts; adding/removing a lead works.

## Dev-team handoff TODOs

The dev team owns these:

1. **Real auth** — uncomment the Supabase block in `designer-plan-site/js/auth.js` and add `SUPABASE_URL` + `SUPABASE_ANON_KEY` as inline `window.*` values at the top of pages that need auth (or via a build step).
2. **Real checkout** — replace the stub in `designer-plan-site/netlify/functions/cart-checkout.js` with the actual checkout integration (Stripe Checkout session creation, or the existing cart backend handoff). Should return `{ checkout_url: <url> }`.
3. **EmailOctopus sync** — when an email list has an `emailoctopus_id`, member adds/removes should also call EmailOctopus's API. Use `EMAILOCTOPUS_API_KEY` env var. The admin UI already shows the column; just needs the API calls in `marketing-center-site/netlify/functions/admin-leads.js`.
4. **Partner-approval workflow** — currently `partners.status` is set to `pending` on application. Build an admin tool (or a thin "approve" button in `/private/lists/` or a sibling page) that flips `status` to `approved`, sets `approved_at`, sends the welcome email, and moves the lead from the `designers-pending` to `designers-partners` list.
5. **Claims app integration** — `https://5starservice.net` is the destination today. If a deeper SSO-style handoff is desired (designer logs into Designer Plan, clicks "File a claim", lands authenticated on 5starservice), that's a future scope.
