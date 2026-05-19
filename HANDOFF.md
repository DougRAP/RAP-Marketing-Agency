# HANDOFF — Designer Plan project

**Maintained for:** any fresh Claude Code agent picking this up. Read this first.
**Last updated:** 2026-05-19
**Owner:** Doug Wright (dwright@raptns.com)

---

## What this project is

`thedesignerplan.com` — an e-commerce landing + sales funnel for the **Designer Plan**
program (36-month furniture protection that interior designers offer clients; designers
earn up to 35% commission). It is the fourth site in the `DougRAP/RAP-Marketing-Agency`
monorepo, deployed as its own Netlify site.

- **Repo:** `DougRAP/RAP-Marketing-Agency`, local at `C:\Newco\AI\Designer\rap-designer-agency`
- **Site folder:** `designer-plan-site/`
- **Live:** `thedesignerplan.netlify.app` (Netlify auto-deploys on push to `main`)
- **Supabase:** project URL `https://myjbhfqtdzcqmbmegqqh.supabase.co`, owned by Doug, dev-led by Adrian

## Read these before doing anything

| Doc | What it covers |
|---|---|
| `docs/dashboard-onboarding-plan.md` | PRD — dashboard, onboarding, admin console, promotions, two-tier access |
| `docs/db-plan.md` | DB schema, lead-capture architecture, **operational rules** (do not violate) |
| `designer-plan-site/DEPLOY.md` | Netlify + Supabase setup, env vars, dev-team TODOs |
| `designer-plan-site/README.md` | Site structure, funnel flow |
| `C:\Newco\AI\Designer\Onboarding Plan\` | Doug's onboarding playbook + diagram (source material) |

## Current state

**Deployed and working:** landing (`/`), plans (`/plans`), `/partner`, `/partner-apply`,
`/about`, `/partnership`, `/terms`, `/privacy`, `/login` (stub), `/dashboard` (preview mode).

**Schema:** three migrations in `supabase/migrations/` — `20260511_base_schema.sql`,
`20260512_designer_plan_extensions.sql`, `20260518_dashboard_onboarding.sql`.

## ACTIVE BLOCKERS

1. **RLS locked.** Adrian locked row-level security on the Supabase tables. Functions
   connect but cannot write (`new row violates row-level security policy`). Adrian is
   fixing this. Until then, no function that writes to the DB works end-to-end.
2. **Wrong key in Netlify.** The `thedesignerplan` Netlify site has an env var named
   `SUPABASE_KEY` holding the **publishable/anon** key. Functions need the **secret /
   service_role** key (`sb_secret_…`). Doug to swap the value. Code already accepts
   either `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_KEY` (`netlify/functions/_supabase.js`).
3. **`env-check.js`** is a temporary diagnostic function — delete it once blockers clear.

## ACTIVE WORKSTREAM (as of 2026-05-19)

Three pages are being redesigned. **Design is outsourced to "claude browser"** (the
browser Claude, better at visual design). Process per page:

1. A Claude Code agent writes a brief MD (`docs/browser-brief-*.md`).
2. Doug hands the brief to a claude browser agent; it returns HTML.
3. Doug reviews/adjusts, uploads the HTML back.
4. A Claude Code agent wires it into the site.

The three pages:
- **Dashboard** — public link, dummy data for "Example Designer Studio", login control
  at top. Single responsive page, mobile-first. Brief: `docs/browser-brief-dashboard.md`.
- **Admin** — public link (not login-gated yet), desktop-first. Internal-team reference.
- **Partner With Us** — refactor to **three tracks**: (1) Call us, (2) Quick Start
  (buy now / guest checkout), (3) Set up account now. Desktop-first.

## HARD RULES (do not break — Doug flagged these)

1. **CSS — no drift.** All new pages MUST use the exact CSS from the home page
   (`designer-plan-site/index.html` `<style>` block). Do NOT create new stylesheets,
   do NOT invent color/font tokens, do NOT drift to pretrained defaults. The earlier
   `/partner` page wrongly used a separate `_shared/_partials.css` — that was the
   mistake to avoid. New pages must drop in seamlessly.
2. **Navigation — one canonical nav.** It became inconsistent across pages once.
   Decision: a clear, always-obvious **hamburger menu** on all viewports, containing
   every page including Home. Users must be able to move between pages intuitively
   (the trigger bug: no obvious "return home" from `/plans` and `/partner`).
3. **Slow down.** Plan, ask questions, confirm before coding. Use the `.claude` skills.
   Do not bang out features. Bad work is worse than no work.
4. **Operational rules in `docs/db-plan.md`** — no new Netlify accounts, secrets in
   env vars only, migrations checked in, don't touch the other three monorepo sites.

## Skills to use (in `C:\Users\DWright\.claude\skills` and Anthropic skill set)

- `handoff` (mattpocock) — update this file
- `to-prd` / `to-issues` (mattpocock) — planning
- `gstack` — QA / browser testing of deployed pages
- `grill-me` — stress-test a plan
- mattpocock `tdd`, `improve-codebase-architecture` — build phase

## Roles

- **Chief Claude Code agent** — strategy, design control, briefs, integration, review.
- **Second Claude Code agent** (optional, limited engagements) — grunt work only:
  wiring returned HTML, nav cleanup, diagnostic teardown. Must get specific
  instructions, a defined role, and told which skills to use.
- **claude browser agents** — one per page, design only, tightly controlled by brief.
- **Adrian** — owns the Supabase database.

## Open items (after the three pages ship + a bug re-check)

- Real auth (Supabase Auth, magic link) — needs RLS unlocked + anon key
- Promotions wiring (Promo A 40% claim, Promo B 10% referral)
- Netlify functions: dashboard-data, otp-send/verify, promo-claim, account-create
- Admin console build (marketing-center vs designer-site — see PRD open item)
- Reconcile Promo A public wording
