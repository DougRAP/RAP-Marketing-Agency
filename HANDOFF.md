# HANDOFF — Designer Plan project

**Maintained for:** any fresh Claude Code agent picking this up. Read this first.
**Last updated:** 2026-05-21
**Owner:** Doug Wright (dwright@raptns.com)

---

## What this project is

`thedesignerplan.com` — an e-commerce landing + sales funnel for the **Designer Plan**
program (36-month furniture protection that interior designers offer clients; designers
earn up to 35% commission). It is the fourth site in the `DougRAP/RAP-Marketing-Agency`
monorepo, deployed as its own Netlify site.

- **Repo:** `DougRAP/RAP-Marketing-Agency`, local at `C:\Newco\AI\Designer\rap-designer-agency`
- **Parallel worktree** (for isolated agent work): `C:\Newco\AI\Designer\rap-designer-agency-cc-parallel` (git worktree sharing the same `.git`)
- **Site folder:** `designer-plan-site/`
- **Live:** `thedesignerplan.netlify.app` (Netlify auto-deploys on push to `main`)
- **Supabase:** project URL `https://myjbhfqtdzcqmbmegqqh.supabase.co`, owned by Doug, dev-led by Adrian

## Read these in order before doing anything

| Doc | What it covers |
|---|---|
| **This file** | Project state and active blockers |
| `docs/dashboard-onboarding-plan.md` | PRD — dashboard, onboarding, admin console, promotions, two-tier access |
| `docs/db-plan.md` | DB schema, lead-capture architecture, **operational rules** (do not violate) |
| `docs/qa-audit-2026-05-19.md` | Last QA punch list (mostly closed in 4d57046; remaining items live in followups) |
| `designer-plan-site/DEPLOY.md` | Netlify + Supabase setup, env vars, dev-team TODOs |
| `designer-plan-site/README.md` | Site structure, funnel flow |
| `tests/e2e/` (4 Playwright specs) | Adrian's auth-flow spec — the canonical source of truth for the new login/profile flow |
| `C:\Newco\AI\Designer\Onboarding Plan\` | Doug's onboarding playbook + diagram |

## Current state — fully operational

The site is live and the database writes work end-to-end. As of 2026-05-21:

- ✅ Magic-link auth is live (Adrian's PR #3, branch `adrian-onboarding`)
- ✅ Row-Level Security is unlocked via the three new grants migrations
- ✅ All Netlify functions write to Supabase successfully
- ✅ Dashboard suite is live (`/dashboard`, `/dashboard/overview`, `/clients`, `/sales-tools`, `/service`)
- ✅ Site nav is canonical across all public pages
- ✅ Promo A wording reconciled to designer-side 40% framing
- ✅ Playwright e2e suite covers 4 auth "Caminos" — see `tests/e2e/`
- ✅ env-check.js diagnostic removed
- ⚪️ Admin console — **re-scoping in planning (started 2026-05-21).** The earlier 4-page browser brief is being superseded route-by-route in `docs/dashboard-onboarding-plan.md` § "Admin console — routes & role experience". The IA is now four routes (`/admin`, `/admin/designers`, `/admin/clients`, `/admin/agents`). Governing principle: **everyone sees everything; only mutations are gated.** `/admin` and `/admin/designers` are locked; `/admin/clients` and `/admin/agents` next. Tool choice (claude-browser vs claude-code) is deferred until scoping is complete.

## THE AUTH MODEL (read carefully — this changed)

Adrian's `adrian-onboarding` PR replaced the prior anonymous-form model. The new flow:

1. Designer enters email at `/login` → magic link sent.
2. Click magic link → session established + **partner row auto-created** (the playbook's "account first" rule made real).
3. Lands on `/dashboard`. Has an account number from the moment they sign in.
4. Fills out profile data at `/dashboard/profile` (post-login enrichment).
5. **`/partner-apply`** is now a redirect-only page: anonymous → `/login`, authenticated → `/dashboard/profile`. The old "6-field form gating account creation" is gone.

### What this means for verification (Doug's vetting model)

Because anyone with an email can create an account, vetting moved from "before signup"
to "after signup, by phone." Every account starts **unverified**. An operator (agent
or admin) calls the account holder to confirm legitimacy, then:

- **Verify** → account stays alive, designer can use the dashboard
- **Delete (soft-archive)** → if unreachable or fails smell test

This is the admin tool's #1 daily workflow. The admin browser brief
(`docs/browser-brief-admin.md`) was updated to include the verification queue.

### Role model (added 2026-05-21)

Four roles, one per user (one-to-one): **designer · agent · admin · sales**.

- **designer** is the default for any magic-link signup — no row in `operator_roles`. Self-served.
- **agent / admin / sales** are operator roles, created by a manager-admin via `/admin/agents`.
- The **first manager-admin is seeded by Doug via SQL** into `operator_roles`. There is no UI bootstrap for the very first admin — by design.
- A designer is **"sellable as partner"** with just email + phone + address; the full `/dashboard/profile` is optional. Even when not sellable as partner, the designer's client can purchase a plan directly via **Shop Plans**.

Schema: a new `operator_roles` table (`auth.uid()` → role). Absence of a row = designer. See `docs/dashboard-onboarding-plan.md` § "Roles & access" for the full spec. Migration: `supabase/migrations/20260522_admin_console.sql` (write but don't apply; Adrian applies).

### The signup form question (resolved)

The form you may remember from `/partner-apply` was MOVED, not deleted. It now lives at `designer-plan-site/dashboard/profile/index.html` and is reachable only after magic-link login. `/partner-apply` is redirect-only. Profile fields (name, studio, phone, address, products, project size, etc.) are all optional — the designer becomes "sellable as partner" once email + phone + address are populated.

### Implication: pages with stale copy

The `/partner` page still describes "Four steps from interested to specifying" with
step 1 = "Six fields, no phone number required." That copy is now obsolete — the new
flow is one step ("enter your email"). The page needs a copy refresh in a follow-up
pass. Not blocking, flagged for a later QA round.

## Repo layout — what each subfolder does

| Path | Owner / purpose |
|---|---|
| `designer-plan-site/` | The thedesignerplan.com Netlify site (this project's primary surface) |
| `rap-public-site/` | RAP marketing site (older, Adrian recently added function infrastructure) |
| `marketing-center-site/` | Internal Basic-Auth tools site |
| `designer-assets-site/` | Weekly designer email/asset archive |
| `supabase/migrations/` | DB migrations (run in numeric order); current head is `20260519_dashboard_grants.sql` |
| `tests/e2e/` | Playwright auth-flow tests (Adrian's; run with `npm run test:e2e`) |
| `docs/` | PRDs, briefs, audits, handoffs |
| `playwright.config.ts`, `package.json` (root) | Test infra |

## ACTIVE WORKSTREAM (as of 2026-05-21)

The admin console is the next deliverable. Process is the same one we used for the
dashboard:

1. **Brief:** `docs/browser-brief-admin.md` — written, awaiting hand-off to a claude-browser agent.
2. **Design:** Doug pastes the brief into a claude-browser session with the existing dashboard pages attached. claude-browser returns 4 HTML files (`admin-home.html`, `admin-designer.html`, `admin-designers-list.html`, `admin-agents.html`).
3. **Review:** Doug reviews the returned HTML for fidelity to the brief.
4. **Integration:** A second Claude Code agent wires the HTML into the site code, using `docs/agent-brief-admin-integration.md` (this file is written separately; create if missing). Works in the parallel worktree, named branch, no push.
5. **Merge:** Chief agent (or Doug) cherry-picks or merges the integration branch onto `main`.

## HARD RULES (do not break — Doug flagged these repeatedly)

1. **CSS — no drift.** New pages MUST use the existing design tokens verbatim
   (`--paper`, `--ink`, `--accent`, Inter Tight, Inter). Do NOT create new stylesheets,
   do NOT invent color/font tokens, do NOT drift to pretrained defaults. The dashboard
   files in `designer-plan-site/dashboard/` are the visual reference.
2. **Existing dashboard pages are locked.** Bug-checked and live. New work produces
   NEW files; never modifies the existing dashboard files.
3. **Navigation — canonical.** The site nav is **Home · Partner with us · Shop plans · Dashboard · File a claim · Log in** in that order, identical on every public page, desktop and mobile drawer. White-glove was deliberately removed from nav; section anchor `/plans#white-glove` remains.
4. **Slow down.** Plan, ask questions, confirm before coding. Use the `.claude/skills` skills. Bad work is worse than no work.
5. **Operational rules in `docs/db-plan.md`** — no new Netlify accounts, secrets in env vars only, migrations checked in, don't touch the other three monorepo sites.

## Workflow (light touch — adopt gradually)

- **Adrian** works on `adrian-main` / per-feature branches, opens PRs, asks Doug to merge.
- **Doug** works on `main` directly while iteration is heavy.
- **Agents** work in the parallel worktree on named branches (e.g. `quickwins-2026-05-19`), no push to origin — chief agent (or Doug) cherry-picks onto main.
- **Future state:** everyone on feature branches + PRs (GitHub Flow). Soft adoption.

## Skills to use (in `C:\Users\DWright\.claude\skills`)

- `handoff` (mattpocock) — update this file
- `to-prd` / `to-issues` (mattpocock) — planning
- `gstack` and sub-skills `qa-only`, `design-review`, `review` — QA / browser testing
- `grill-me` — stress-test a plan
- mattpocock `tdd`, `improve-codebase-architecture` — build phase

## Roles

- **Chief Claude Code agent** — strategy, design control, briefs, integration, review.
- **Second Claude Code agent** (limited engagements) — grunt work only: wiring returned HTML, nav cleanup, mechanical fixes. Must work in parallel worktree, no push, named branch. Gets a specific brief and a "don't touch this" list. Returns commit SHAs and diff stats; chief agent (or Doug) does the merge.
- **claude browser agents** — one per page, design only, tightly controlled by brief. No file system access; output is HTML pasted into chat. Always include anti-drift rules at the top of the brief.
- **Adrian (Adrian Barres)** — owns the Supabase database, RLS, migrations, auth, and Netlify functions for shared infra. Opens PRs that Doug merges.

## Recently completed

- **2026-05-21** — Adrian's `adrian-onboarding` PR landed (commit `8f24059`). Magic-link auth wired, three new RLS-grants migrations (`20260514`, `20260515`, `20260519`), `public-config` function added, account-bootstrap function added, `auth.js` rewritten from stub to real, Playwright e2e suite (4 specs, 16 tests), `rap-public-site` got function infrastructure, partner-apply now redirects.
- **2026-05-21** — Admin browser brief written (`docs/browser-brief-admin.md`); verification workflow added after Doug clarified the "account first, vet by phone" model.
- **2026-05-21** — env-check diagnostic function deleted (`8e3a30f`).
- **2026-05-20** — Quick-wins batch (10 audit items) landed via cherry-pick `4d57046`.
- **2026-05-19** — Dashboard suite integrated (`60356d9`); site nav normalized; PR template + workflow established with parallel worktree.

## Open items

- **Admin console** — claude-browser design pass (next), then integration pass.
- **Partner With Us 3-track refactor** — brief still to write. After admin lands.
- **Stale `/partner` copy** — the "four steps / six fields" copy is obsolete under the new magic-link flow. Refresh in a follow-up pass.
- **`/partner-apply` page** — still exists with the old form. New behavior is redirect-only. The form content might move to `/dashboard/profile` or be removed entirely. Verify against Adrian's e2e specs.
- **Promotions wiring** — Promo A 40% claim, Promo B 10% referral. Functions and UI not built yet.
- **Cart checkout** — `cart-checkout.js` is still a stub. Needs Stripe Checkout session creation or handoff to the existing cart backend.
- **Followups doc** — `docs/qa-followups.md` referenced in the quick-wins brief but never created. Worth starting when fresh issues are found.

## How to spin up a new agent

Open a fresh Claude Code session pointed at `C:\Newco\AI\Designer\rap-designer-agency`. As the first message:

> Read `HANDOFF.md`. Then `docs/dashboard-onboarding-plan.md` for PRD context and `docs/browser-brief-admin.md` for the current workstream. The admin claude-browser design pass is the active task — when Doug returns the 4 HTML files, write `docs/agent-brief-admin-integration.md` and use the parallel-worktree pattern to wire them in. Ask Doug if anything is ambiguous.
