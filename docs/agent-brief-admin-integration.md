# Brief — Admin integration agent

**Audience:** Fresh Claude Code agent assigned to wire claude-browser's admin HTML files into the live site.
**Repo:** `DougRAP/RAP-Marketing-Agency`.
**Working directory (IMPORTANT):** `C:\Newco\AI\Designer\rap-designer-agency-cc-parallel` — a git worktree of the same repo, isolated from chief work. Do all work here.
**Date issued:** 2026-05-21
**Issued by:** Chief agent on Doug's behalf.

---

## Read these in order

1. `HANDOFF.md` — project state, hard rules, the new auth model.
2. `docs/browser-brief-admin.md` — the design brief claude-browser executed (so you know what the HTML was supposed to be).
3. `docs/dashboard-onboarding-plan.md` (sections on admin + verification) — the PRD context.
4. This file.

---

## Your role

**Integration only.** No new design. No copy rewrites. No CSS invention. claude-browser produced four HTML files; your job is to wire them into the site code as routes under `/admin/...`, hook them up to existing data plumbing where trivial, and stop there.

---

## What you're integrating

Doug will hand you **four HTML files** from claude-browser:

- `admin-home.html` → mount at `designer-plan-site/admin/index.html`
- `admin-designer.html` → mount at `designer-plan-site/admin/designer/index.html`
- `admin-designers-list.html` → mount at `designer-plan-site/admin/designers/index.html`
- `admin-agents.html` → mount at `designer-plan-site/admin/agents/index.html`

Each should be saved verbatim to its target path, then internal links rewritten from claude-browser's relative paths (e.g. `admin-designer.html`) to clean URLs (`/admin/designer`, `/admin/designers`, `/admin/agents`, `/admin`).

---

## Hard rules (non-negotiable)

1. **Do NOT touch the existing dashboard files** under `designer-plan-site/dashboard/`. They are locked, live, bug-checked.
2. **Do NOT modify CSS design tokens** anywhere.
3. **Do NOT change the canonical site nav.** Set: Home · Partner with us · Shop plans · Dashboard · File a claim · Log in. New admin pages may include their own internal "admin sidebar" or "operator bar" links (Dashboard / Designers / Agents etc.) but should preserve a link back to the public site (or rely on the logo).
4. **Branch:** create `admin-integration-2026-05-21` (or current date) off `origin/main`. **DO NOT push.** Doug merges via cherry-pick or merge-back from the chief dir.
5. **Worktree sync first.** Before branching, `cd` into the worktree, `git fetch origin`, then `git switch -c admin-integration-2026-05-21 origin/main`. Verify with `git log --oneline -3` that the branch base includes the latest `main` (Adrian's PR `8f24059`).
6. **Schema migration** — write but don't apply: `supabase/migrations/20260522_admin_console.sql` (or current date). Adrian applies migrations to live DB himself.
7. **No clever logic.** This is HTML mounting + minor JS for verify/delete buttons. No new features beyond what the brief and the returned HTML specify.

---

## The integration steps

### Step 1 — Mount the HTML files

```
designer-plan-site/admin/
  index.html              ← from admin-home.html
  designer/
    index.html            ← from admin-designer.html
  designers/
    index.html            ← from admin-designers-list.html
  agents/
    index.html            ← from admin-agents.html
```

Save each file verbatim. Then in each file, rewrite any relative links claude-browser used (like `admin-designer.html`) to clean URLs. Possible refs to rewrite:

- `admin-home.html` → `/admin`
- `admin-designer.html` → `/admin/designer`
- `admin-designers-list.html` → `/admin/designers`
- `admin-agents.html` → `/admin/agents`

Use `grep` first to find every relative ref before editing.

### Step 2 — Schema migration

Write a new migration file `supabase/migrations/20260522_admin_console.sql` adding (idempotent, additive only):

```sql
-- ============================================================
-- Admin console — verification, tasks, notes, daily messages
-- Additive only. Service-role writes; RLS denies anon.
-- ============================================================

-- Verification fields on partners
alter table public.partners
  add column if not exists verified_at  timestamptz,
  add column if not exists verified_by  uuid references public.partners(id) on delete set null,
  add column if not exists archived_at  timestamptz;

create index if not exists partners_verification_idx
  on public.partners (verified_at)
  where verified_at is null and archived_at is null;

-- Tasks (operator workload)
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid references public.partners(id) on delete cascade,
  client_id       uuid,  -- references future clients table; nullable for now
  title           text not null,
  body            text,
  due_at          timestamptz,
  priority        text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status          text not null default 'open' check (status in ('open','done','cancelled')),
  assigned_to     uuid references public.partners(id) on delete set null,
  created_by      uuid references public.partners(id) on delete set null,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists tasks_due_idx       on public.tasks (due_at)   where status = 'open';
create index if not exists tasks_assignee_idx  on public.tasks (assigned_to, status, due_at);
create index if not exists tasks_partner_idx   on public.tasks (partner_id);

-- Notes (operator timeline, no status)
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid references public.partners(id) on delete cascade,
  client_id   uuid,
  body        text not null,
  created_by  uuid references public.partners(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists notes_partner_idx on public.notes (partner_id, created_at desc);

-- Daily broadcast (Omega's "tell the team" message)
create table if not exists public.daily_messages (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  posted_by   uuid references public.partners(id) on delete set null,
  posted_at   timestamptz not null default now(),
  expires_at  timestamptz
);

-- RLS — service role only for writes; authenticated reads gated by app
alter table public.tasks           enable row level security;
alter table public.notes           enable row level security;
alter table public.daily_messages  enable row level security;
```

Confirm with Doug whether the migration should also include any `team_members` or `agent_commissions` tables — these are mentioned in the PRD but not in the current admin brief. **Default: don't include.** Add later if needed.

### Step 3 — Wire the verify/delete buttons (minimum-viable)

The verification queue and per-account verify/delete buttons claude-browser produced need real handlers. Write a small Netlify function `designer-plan-site/netlify/functions/admin-verify-partner.js`:

```js
// POST { partner_id, action: 'verify' | 'archive' }
// Auth: requires bearer token. Caller must be a partner with role admin/agent
// (check via service role lookup). For now, accept any authenticated request and
// log who did what to lead_events. Tighten role-checking in a follow-up.
```

If the auth-role logic feels uncertain, **stop and ask Doug**. Don't invent a role model.

The HTML's `✓ Verify` and `✕ Delete` buttons should POST to this function with the partner_id. Loading state, success toast, refresh list on success — keep UI logic minimal.

### Step 4 — Add Dashboard link to site nav

Add `<li><a href="/admin">Admin</a></li>` to the canonical site nav, between **Dashboard** and **File a claim**. Apply to all 9 public-site pages (landing, plans, partner, partner-apply, about, partnership, terms, privacy, login). Skip the dashboard portal nav — admin is reachable from the site nav, not the dashboard's internal nav.

Open question for Doug: should `/admin` show in the nav for unauthenticated visitors? Default: yes — clicking it from a logged-out state hits the page, which (if claude-browser built it as the PRD spec asked) redirects to `/login`. Verify the returned HTML actually does this redirect; if not, kick the gap back to Doug.

### Step 5 — Run e2e tests

```bash
cd C:/Newco/AI/Designer/rap-designer-agency-cc-parallel
npm install                    # if not already
npx playwright install         # if not already
npm run test:e2e
```

Adrian's existing tests (`tests/e2e/00-anonymous.spec.ts` through `03-...`) should still pass — they cover the auth flow, not admin. If any fail after your changes, **stop and ask Doug** before committing.

### Step 6 — Commit + report

Single commit (or two — one for HTML mount, one for migration + function) on the branch. Push: **no.** Output for Doug to review:

```bash
git log main..HEAD --oneline
git diff --stat main..HEAD
```

Plus a short Markdown summary of what shipped, anything skipped, anything that needed clarification.

---

## What to do if anything is ambiguous

Stop. Ask Doug in chat. Don't guess. The chief agent is **not** available to consult — only Doug. Patterns that should trigger a stop:

- The returned HTML uses a CSS pattern or token not in the existing dashboard files
- The returned HTML modifies (not just references) the public site nav
- Adrian's e2e tests fail after your changes
- A verify/delete action needs role-based authorization logic
- A `claude-browser` output references a function or migration that doesn't exist
- You feel tempted to "improve" anything

---

## What is OUT of scope

- The Partner-With-Us 3-track refactor (separate workstream after admin lands)
- Promotions wiring (Promo A claim, Promo B referral) — function + UI work for later
- Stripe Connect onboarding flow
- Real Omega AI logic (the panel is a placeholder per the brief)
- The marketing-center admin lists page (`marketing-center-site/private/lists/`) — that's a separate site

---

## After you finish

1. Confirm in chat to Doug: which files committed, the local commit SHA(s), and your `git log` / `git diff --stat` outputs.
2. Don't update `HANDOFF.md` directly. List the changes that need to land there and Doug or the chief agent will add them.
3. STOP. Do not pick up another workstream.
