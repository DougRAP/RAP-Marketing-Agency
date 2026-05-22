# PRD — Designer Dashboard, Onboarding & Admin Console

**Project:** thedesignerplan.com (designer-plan-site)
**Owner:** Doug Wright
**Status:** Draft for review — planning complete, not yet sliced into issues
**Date:** 2026-05-18
**Source material:** `C:\Newco\AI\Designer\Onboarding Plan\` — onboarding diagram, Designer Plan Onboarding Playbook, Faire signup reference, team email.

---

## Problem Statement

Designer Plan is getting attention — email opens, site visits, calls — but attention is not converting into plan sales. Interested interior designers are busy. When the first step is "complete a full application, set up Stripe, learn a new program, then figure out how to sell it," good leads stall in an inbox and are lost.

Today the site has a self-serve application (`/partner-apply`) and a lead-capture popup, but:

- A designer who applies (or is signed up by an agent on a call) has nowhere to go afterward — no dashboard, no link, no code.
- A designer cannot see the purchases attributed to them.
- A referral contact who only ever received a code has no way to look up their activity.
- The onboarding team has no console to create accounts, assign follow-up, or track status.
- There is no mechanism to run the two launch promotions.

## Solution

A **designer dashboard that is itself the onboarding process**, governed by the playbook's rule: **account first, link/code immediately, Stripe later, track every source.** Nothing blocks a designer from selling; Stripe is the last, optional step and gates payout only.

The work has four parts:

1. **Designer dashboard** — the operating surface for a partner: their link/code, attributed purchases, commission, toolkit, promotions, and an onboarding checklist that runs the setup flow.
2. **Two-tier access** — a no-password OTP "code lookup" tier for referral contacts and not-yet-committed designers, and a full account tier.
3. **Admin console** — an internal tool for the onboarding team, inside the existing marketing-center site, to create accounts, assign follow-up, and track status.
4. **Scheduler** — book an onboarding or help call.

## Governing Principles (from the playbook — non-negotiable)

- Account first. Give a code/link right away. Require Stripe later.
- Track every source (email, phone, text, social, website, referral, word of mouth).
- No interested person leaves an interaction without a link, code, next action, and owner.
- The dashboard must work fully with Stripe pending. Stripe is a nudge, never a gate.
- Low friction over completeness — ship the account/code machine before the perfect dashboard.

## User Stories

### Prospective designer / lead

1. As an interested designer, I want to sign up with just my name and email, so that I am not blocked by a long form.
2. As an interested designer, I want to optionally tell Designer Plan what I specify and my typical job size, so that they can support me better — but I want to skip it if I am busy.
3. As an interested designer, I want a free-text box to add anything else relevant, so that I can share context the checkboxes do not cover.
4. As a designer signed up by an agent on a call, I want my account to already exist when I click the welcome link, so that I have nothing to fill out.
5. As an interested designer, I want to schedule a video call to learn more, so that I can ask questions before committing.

### New designer (account created, onboarding)

6. As a new partner, I want to land on a dashboard that shows me exactly what to do next, so that I am not lost.
7. As a new partner, I want my referral link and code available immediately, so that I can start selling before finishing setup.
8. As a new partner, I want to copy my client link and download a QR code, so that I can use it digitally or in person at project closeout.
9. As a new partner, I want to see the onboarding steps as a checklist, so that I can track my own progress.
10. As a new partner, I want to defer Stripe setup, so that I am not forced to hand over bank details before I have sold anything.
11. As a new partner, I want a toolkit of selling materials — a printable one-pager, talk tracks, a tier comparison, and pre-written client email/text copy — so that I can present the plan confidently.
12. As a new partner, I want to schedule my onboarding training from the dashboard, so that I get a proper walkthrough.

### Active designer

13. As an active partner, I want to see every purchase attributed to my account or code, so that I know my activity.
14. As an active partner, I want to see commission split into "tracked" and "payable," so that I understand what I have earned versus what I can be paid.
15. As an active partner, I want to set up Stripe when I am ready, so that I can receive payouts.
16. As an active partner, I want to claim the "first plan on us" promotion and name the client it applies to, so that I get the launch benefit.
17. As an active partner, I want to refer another designer with a link and earn a one-time bonus commission if they purchase, so that I am rewarded for growing the network.
18. As an active partner, I want to send a purchase link directly to a client, so that the client can buy themselves when I prefer not to handle it.
19. As an active partner, I want a "file a claim" link that opens the claims app, so that I can help a client start a claim quickly.
20. As an active partner, I want to schedule a help call any time, so that I can get support beyond onboarding.
21. As a studio owner, I want to invite team members and control who can access my account, so that my assistant or project manager can operate without me.
22. As an active partner, I want the dashboard to work well on my phone, so that I can use it during a project, not just at a desk.

### Referral contact (code, no account)

23. As a referral contact with only a code, I want to look up my activity by confirming my email or phone, so that I do not have to create a full account.
24. As a referral contact, I want to see how many purchases my code has tracked and the commission accrued, so that I know my referrals are counted.
25. As a referral contact, I want a clear path to claim a full account, so that I can upgrade if I want to.

### Onboarding agent (admin)

26. As an onboarding agent, I want to see new signups and leads in one list, filterable by status, source, and assigned agent, so that I can work my queue.
27. As an onboarding agent, I want to create a lightweight account from minimal information during a call, so that the prospect leaves the call with an account and code.
28. As an onboarding agent, I want to assign an owner and a next-action date to every record, so that no lead is dropped.
29. As an onboarding agent, I want to log call notes and preferences about a designer, so that the next touch is informed.
30. As an onboarding agent, I want to generate a code and trigger a welcome email in one action, so that follow-through is fast.
31. As an onboarding agent, I want to see and nudge Stripe status, so that I can prompt payout setup at the right time.
32. As an onboarding agent, I want to see the lead's source and full event history, so that I understand how they arrived.
33. As an onboarding manager, I want every account to carry a status from a defined vocabulary, so that pipeline reporting is consistent.

### Client

34. As a client who received a designer's link, I want to review and purchase a plan directly, so that I can protect my furniture without back-and-forth.

## Implementation Decisions

### Account model

- **Two account types.** *Designer/Studio account* — the real account: carries an account number, a referral code, a dashboard, team seats, and is the entity that gets paid. *Independent Referral Contact* — a lightweight record with a referral code for attribution only (outside person who introduces business; not a studio employee).
- **Studio Team Members are not a separate type.** They are additional login seats under a Designer/Studio account, invited and controlled by the account owner. This is why the role count collapsed from three to two.
- **Account number** is generated at account creation (human-readable, e.g. `DP-10042`), stored in the database, and is the canonical account identifier.
- **Referral code** is a separate, shareable, vanity-friendly attribution token (studio-name-derived). Account number = identity; referral code = link attribution. They are distinct fields.

### Access tiers

- **Tier 1 — Code Lookup.** No password. Positioned as "confirm your email and details," not "create an account." The contact verifies ownership via a one-time passcode sent to the email OR phone on file (the user chooses the channel). Returns a read-only view: referral code, count of attributed purchases, commission accrued (marked pending), Stripe status, and a "claim your full account" call to action.
- **Tier 2 — Full Account.** Login by magic link / OTP by default. A password is set only when the partner commits to Stripe to earn commission — the password is the "this is now a money account" signal. Tier 2 is a superset of Tier 1; upgrading from Tier 1 is an in-place state change on the same record, not a migration.

### Roles & access (operator vs designer)

Two axes of access in this system: **who you are** (account type, above) and **what you can do** (role). Roles apply to every logged-in user. Decided 2026-05-21.

**Four roles. One role per user (one-to-one).** Multi-role was considered and rejected as messier than the value it provides.

| Role | Created by | Purpose |
|---|---|---|
| `designer` | Self — magic-link signup at `/login`. Default for any new sign-in. | Uses `/dashboard`. Never sees the admin console. |
| `agent` | Manager-admin via `/admin/agents`. | Operator. Handles a book of designers; adds notes, creates/completes tasks, verifies new accounts. Sees all designers and all notes/tasks (visibility is shared, assignment is a responsibility flag). |
| `admin` | Manager-admin via `/admin/agents`. The first manager-admin is seeded by the system admin (Doug) via SQL — no UI bootstrap. | Superset of agent. Plus: manages team (`/admin/agents`), bulk-assigns designers to agents (`/admin/designers`), authors the daily Omega broadcast. |
| `sales` | Manager-admin via `/admin/agents`. | Read-only manager view. Same UI as admin; every edit control hidden or disabled. |

**Schema (separate table, for Adrian):** an `operator_roles` table mapping `auth.uid()` → role. One row per operator. Designers do NOT get a row — absence of a row means "default role: designer." Keeps `partners` clean of internal-user state, and a person can simultaneously be a designer (a `partners` row) and an operator (an `operator_roles` row) without a column collision.

**Designer eligibility — orthogonal to role.** Two states the operator UI surfaces independently from verification:

- **Sellable as partner** — has at minimum a valid email, phone, and address. The full profile at `/dashboard/profile` can stay blank; partial profile is fine for selling.
- **Not sellable as partner** — missing one of email / phone / address. The designer can't earn attributed commission yet, but their client can still purchase a plan directly by navigating to **Shop Plans**. Operators should surface this as the next-action ("call to collect missing info").

When a designer is BOTH unverified AND missing contact info, the operator banner combines into one call-to-action ("Unverified — call to verify and collect phone/address"), not two separate banners.

**Bootstrap path:** the first admin is seeded by Doug via SQL insert into `operator_roles`. From there, all team-member creation happens through `/admin/agents`. No UI is built for the system-admin → first-manager-admin handoff.

### Onboarding flow (the dashboard checklist)

The dashboard's top module is an onboarding checklist with this sequence. Stripe is deliberately last and optional.

1. Account created — already done on arrival.
2. Approved — automatic or quick agent review.
3. Get your link and start selling — copy link, download QR, open the toolkit. This is the value moment.
4. Schedule onboarding call — optional, encouraged.
5. Connect Stripe — last, optional, framed "Want to get paid?" Gates payout only; never gates selling. Commission accrues as "tracked / pending" without it.

### Dashboard modules

- **Header** — name, studio, status badge, account number, referral code with one-click copy.
- **Onboarding checklist** — the five steps above; collapses to a thin bar once complete.
- **Primary actions** — copy client link, download QR, shop plans, set up Stripe (only while pending), schedule a call, file a claim (opens the claims app).
- **Activity / purchases table** — every purchase attributed to the account or code: client (masked), tier, date, source, commission, claim status.
- **Commission summary** — "tracked" total versus "payable" total; payable is gated on Stripe completion. Tracked commission is always visible — it is the motivator.
- **Toolkit** — printable plan one-pager / leave-behind (point-of-sale material), pre-written client email and text copy (pre-filled with the partner's link), tier comparison sheet, QR code, talk tracks adapted from the playbook script library, reusable success stories.
- **Promotions** — claim Promo A; access the Promo B refer-a-designer link.
- **Support** — named partner-success contact, schedule-a-call button.

### Promotions (two, in v1)

- **Promo A — "First plan on us."** Public-facing offer; claimed on the dashboard. The designer claims the promo and names the client the first plan applies to. Money flow (confirmed): the **client pays full price**; the designer's **commission is boosted on that first deal** so the value of a complimentary plan lands with the designer, capped at $5,000 of coverage value. The public page wording ("your first client's plan, complimentary") must be reconciled to this designer-side framing.
- **Promo B — "Refer a designer."** A dashboard feature: the partner sends a referral link to another designer. If that designer signs up and makes a purchase, the referrer earns a **one-time 10% bonus commission** on that purchase. This is designer-to-designer attribution, distinct from the client referral code.

### Admin console

- Lives **inside `designer-plan-site` under `/admin/...`** (changed from the earlier "marketing-center" plan). Gated by `operator_roles`, not Basic Auth. One internal home, to keep the team focused.
- Capabilities: lead/signup list with filters (status, source, assigned agent); create a lightweight account from minimal fields (Faire-style short form — name, email, studio, role, source); assign owner and next-action date; click-to-call and log a call; generate code + send welcome in one action; view and nudge Stripe status; view full event history; per-designer notes (timestamped, attributed) and an agent-only preferences field never shown to the designer.
- **Status vocabulary** (from the playbook): New Lead → Account Created → Code Sent → Buy Now Link Sent → Stripe Invited → Stripe Complete → First Sale → Active Partner → Nurture.

### Admin console — routes & role experience

*Scoped one route at a time. Last updated 2026-05-21.*

#### Information architecture (four routes)

The admin console is four URLs under `/admin`. Each route has its own audience. Visibility is shared (everyone with a role sees the same data); action-ability is gated.

| Route | Audience | Purpose |
|---|---|---|
| `/admin` | agent · admin · sales | Operator workspace — daily surface. Master/detail. |
| `/admin/designers` | admin (sales TBD — scoped next) | Manage designer accounts — assign agents, bulk operations, archive. |
| `/admin/clients` | agent · admin · sales (admin CRUD, others view) | Manage client records — filter by designer. |
| `/admin/agents` | admin only | Manage the operator team. |

Common chrome on every route: sticky top operator bar (role badge, mode switcher, global search, `+ Task` / `+ Note`, `⊙ Ask O`) and the Omega slide-out panel from the right edge.

The earlier brief specified four *pages* (admin-home + admin-designer were separate). They collapse into one route — `/admin` — with the selected designer in the URL (`/admin/d/{account_number}`). Same layout in both states; only the right pane differs.

#### Governing principle (decided 2026-05-21)

**Everyone sees everything. Only mutations are gated.**

All three operator roles can navigate to all four routes, see the same UI surface, see the same data. The mode switcher shows all four entries to every role. What differs by role is which **mutation affordances** render: buttons that change state (`+ Add`, Edit, Delete, Verify, Archive, Restore, Reassign, Change status, Send welcome, `✓ Done`, Tell Omega composer, etc.). Per the earlier rule, mutation affordances are **hidden**, not greyed out, for roles that can't use them — sales should never feel like they "could click but can't."

Routes themselves do not 403 by role. The page loads for everyone; the page's mutation buttons reflect the viewer's permissions.

The matrix below applies this principle to `/admin`. Equivalent matrices for the other three routes follow.

#### `/admin` — operator workspace (locked 2026-05-21)

Master/detail screen. Left rail = designers queue. Right pane = operator landing (no selection) OR designer detail (selection). Selection lives in the URL.

**Three roles, three experiences.** Everyone sees the same surface; mutation affordances are hidden for roles that can't mutate.

| Element | agent | admin | sales |
|---|---|---|---|
| Role badge | `AGENT` | `ADMIN` | `SALES` |
| Mode switcher | Workspace · Designers · Clients · Team | Same | Same |
| Global search | ✓ | ✓ | ✓ |
| `+ Task` / `+ Note` in operator bar | ✓ | ✓ | Hidden |
| `⊙ Ask O` trigger | ✓ | ✓ | ✓ |
| Left rail (designers list w/ search + filters) | ✓ — default "My designers" | ✓ — default "All" | ✓ — default "All" |
| Filter chips | All · My designers · No contact 14+ days · Unverified · Missing info | Same | Same |
| KPI strip (6 cards) | ✓ | ✓ | ✓ |
| Verification queue — list visible | ✓ | ✓ | ✓ |
| Verification queue — `✓ Verify` / `✕ Delete` buttons | ✓ | ✓ | Hidden |
| Today's tasks list visible | ✓ — my tasks today | ✓ — my tasks today | ✓ — empty for sales (sales doesn't get tasks assigned) |
| Today's tasks — `✓ Done` button | ✓ | ✓ | Hidden |
| Recent team activity feed | ✓ | ✓ | ✓ |
| Landing pane content | Full operator landing | Full operator landing | Full operator landing (no separate sparse view) |
| Designer detail when selected — data | ✓ | ✓ | ✓ |
| Sticky operator banner (verified / sellable, combined when both apply) | ✓ | ✓ | ✓ |
| `✓ Verify` / `✕ Delete` in banner (unverified only) | ✓ | ✓ | Hidden |
| `+ Note` / `+ Task` on section headers + client rows | ✓ | ✓ | Hidden |
| Inline client CRUD on activity table | View only | `+ Add` / Edit / Delete | View only |
| Operator Timeline at bottom (notes, tasks, call log, status changes) | ✓ | ✓ | ✓ |
| `✓ Mark done` on open tasks in timeline | ✓ | ✓ | Hidden |
| Omega — chat input + Today's Alerts list | ✓ | ✓ | ✓ |
| Omega — "Tell Omega something to broadcast today" composer | Hidden | ✓ | Hidden |

**Behavioral rules:**

- **Everyone sees everything; only mutations are gated.** Governing principle above. Sales sees the same operator surface as agent/admin — KPIs, verification queue, today's tasks, activity feed, designer detail. The mutation buttons are simply absent for them.
- **"My designers" is a filter, not a permission boundary.** An agent can switch to "All" at any time and act on any designer's record.
- **KPI counts are global.** All 6 cards reflect the whole pipeline for every role.
- **Today's tasks is personal** (assigned to the viewer). Sales sees the section but it's empty by definition — sales doesn't have tasks. The empty state explains this.
- **Mutation affordances are hidden, not greyed out**, for roles that can't use them. Sales sees a calm read-only surface, not a frustrated locked-down one.
- **The Omega panel is identical on every route.** Composer is admin-only; chat + alerts available to everyone.

**Edge-case behaviors:**

- **Brand-new agent with empty book.** "My designers" filter empty by default → show empty-state CTA: *"No designers assigned yet — your admin will assign you a book. Browse all designers →"*.
- **Archived designer accessed via URL.** Right pane shows: *"This account was archived on {date} by {operator}"* placeholder. Admin sees a Restore button; agent + sales see no restore option.

**Scoping status:** `/admin` locked; `/admin/designers` locked below; `/admin/clients` and `/admin/agents` next.

#### `/admin/designers` — designer accounts management (locked 2026-05-21)

Full-width data table. No left rail (different layout from the workspace — this is bookkeeping, not workflow). The "manage the population of designers" surface.

**Default view:** active designers. Archived are hidden behind the "Show" filter.

**Row layout — collapsible:** each row is collapsed by default with the at-a-glance columns visible; an expand affordance reveals a single info card with all available designer details. Same card UI for all three roles. Keeps the table from getting wide.

**Collapsed columns** (everyone sees): `☐` · Name · Studio · Status · Agent · Last contact · Next-action · `▾` expand.

**Expanded info card** (everyone sees, single card per row): Name · Email · Phone · Address · Studio · Source · Status · Assigned agent · Signup date · Last sale date · Last contact · Next-action · Verified (date) · Sellable (with missing fields if any) · Open tasks count.

**Filters across the top** (everyone uses): Search (name) · Assigned agent · Lifecycle status · Verification (All / Unverified / Verified) · Sellability (All / Sellable / Not sellable) · Last contact (any / 7d / 14d / 30d / 90d / older / never) · Show (Active / Archived / All).

**Status vocabulary** (playbook): New Lead → Account Created → Code Sent → Buy Now Link Sent → Stripe Invited → Stripe Complete → First Sale → Active Partner → Nurture.

**Three roles, three experiences — universal visibility, gated mutations:**

| Element | agent | admin | sales |
|---|---|---|---|
| Route access (navigation) | ✓ | ✓ | ✓ |
| Role badge | `AGENT` | `ADMIN` | `SALES` |
| Mode switcher | Workspace · Designers · Clients · Team | Same | Same |
| Full table data | ✓ | ✓ | ✓ |
| All filters | ✓ | ✓ | ✓ |
| Row expand to view info card | ✓ | ✓ | ✓ |
| `+ Add designer` button (full-info form) | ✓ | ✓ | Hidden |
| `☐` Bulk-select checkboxes | Hidden | ✓ | Hidden |
| Bulk-assign agent · Bulk change status · Bulk archive | — | ✓ | — |
| Per-row View (opens workspace detail at `/admin/d/{account}`) | ✓ | ✓ | ✓ |
| Per-row Reassign agent · Change status · Send welcome email | ✓ | ✓ | Hidden |
| Per-row Archive | Hidden | ✓ | Hidden |
| Per-row Restore (archived rows only) | Hidden | ✓ | Hidden |

**`+ Add designer` form fields:**

- Name * — required
- Email * — required, magic-link destination
- Phone * — required for sellability
- Address — street, city, state, ZIP — required for sellability
- Studio / business name
- Source — dropdown: phone-inbound · phone-outbound · email · web · referral · social · other
- Optional first note — free-text; creates an initial `notes` row attributed to the operator

Rationale: agents do outbound and inbound phone/email signups. Capturing email + phone + address upfront on the call means the designer is sellable as a partner immediately, no follow-up call needed.

**Editability of designer info** (from any operator surface — workspace detail or admin/designers row expand):
- Agent + admin can edit any of the captured fields.
- Sales is view-only — no edit affordance shown.

**Audit trail:** every mutation on this route — add-designer, bulk-assign, bulk-change-status, bulk-archive, per-row reassign / change-status / send-welcome / archive / restore, and any edit-info changes — writes a row to `lead_events` with the action type, actor, target designer(s), and before/after values where applicable. Omega reads this log for "did I miss anything" / "what changed today" queries.

**Edge-case behaviors:**

- **Bulk action on a mixed selection.** If an admin selects designers with mixed statuses and runs Bulk change status, the action applies the new status to all selected; no per-row guards (the admin knows what they're doing). Bulk archive likewise applies uniformly.
- **Archive on a designer with active orders.** Allowed (it's a soft-archive: sets `archived_at`, the designer's `/dashboard` becomes inaccessible, but `orders` and attributed commission remain intact). Restore re-enables the account.
- **Send welcome email on an already-onboarded designer.** Allowed — it re-sends the magic-link email. The audit log captures this.

### Scheduler

- Use a real scheduling tool (Calendly or Cal.com) that auto-generates a Google Meet / Zoom link. FaceTime is not used — it cannot be scheduled by these tools and is Apple-only.
- Surfaced in three places: onboarding step 4, a persistent dashboard "schedule a call" button, and the marketing pages / popup follow-up ("prefer to talk first?").
- Booked calls flow back as `lead_events` with `source = 'calendly'`, so the admin console sees them. `docs/db-plan.md` already anticipated this.

### Profiling fields

- Optional, presented at setup, skippable, framed "tells us more so we can help you better": what the designer specifies (multi-select category checkboxes), average job size (single-select range), clients per year (single-select range), and a free-text "anything else we should know" box.
- These extend the existing soft-attribute fields on `leads` (`average_project_size`, `clients_per_year`) plus a new categories field.

### Verification & anti-bot

- One-time passcode to email or phone; the user picks the channel.
- Keep the existing invisible honeypot. No visible/puzzle captcha — it is friction. Hold invisible Cloudflare Turnstile in reserve if spam appears. The OTP step itself is a strong bot filter.

### Auth

- Supabase Auth. Magic-link / OTP is the default. Password is introduced only at Stripe commitment.
- Team seats: an account may have multiple authorized logins; the owner invites and revokes.

### Mobile

- The dashboard is mobile-first and gets the strong responsive treatment. The two marketing pages (landing, plans) may remain laptop-oriented — browse-on-laptop, operate-on-phone is the expected pattern.

### Schema changes (for Adrian — DB owner)

The current schema (`leads`, `lead_events`, `partners`, `plans`, `orders`, `email_lists`, `email_list_members`) needs extension. This PRD does not prescribe the final DDL — it lists what the dashboard requires:

- `account_number` on the partner/account record (generated, unique, human-readable).
- A richer account lifecycle status matching the playbook vocabulary above.
- An `account_type` distinguishing Designer/Studio from Independent Referral Contact.
- Attribution that can credit an order to a **referral code that has no full account** (independent referral contacts).
- First-class `assigned_agent`, `next_action_date`, and `source` fields on the account/lead.
- A `promotions` concept and a `promo_claims` record (which account claimed which promo, for which named client, with the resulting commission adjustment).
- Designer-to-designer referral attribution (which account referred which new account; the one-time bonus on the referred account's purchase).
- An account-membership / team-seat table — multiple Supabase auth users mapped to one account.
- A profiling-categories field (multi-value) and an agent-only `preferences` free-text field.

### Major modules (deep modules to build)

- **Account service** — create a lightweight account; generate account number and referral code; upgrade Tier 1 → Tier 2.
- **Access / auth module** — OTP issue/verify (email or phone), magic-link login, password tier, team-seat invite/revoke.
- **Attribution engine** — given a purchase, resolve the crediting account/code, source, and assigned agent. Pure logic, testable in isolation.
- **Onboarding checklist state machine** — the five-step sequence and transitions.
- **Promotions engine** — Promo A claim + commission boost; Promo B referral bonus. Pure logic, testable in isolation.
- **Admin lead console** — list, filter, create, assign, note, status.
- **Scheduler integration** — Calendly/Cal.com booking + webhook to `lead_events`.

## Testing Decisions

Good tests here verify **external behavior**, not implementation detail. The two highest-value deep modules to test are the **attribution engine** and the **promotions engine** — both are pure logic with clear inputs and outputs, and both directly touch money.

- **Attribution engine** — given a purchase with a code/source, asserts the correct account is credited, the correct source is recorded, and an unattributed purchase is handled cleanly.
- **Promotions engine** — Promo A: claiming on a named client produces the correct boosted-commission figure and refuses a second claim. Promo B: a referred designer's first purchase produces exactly one 10% bonus to the referrer and none thereafter.
- **OTP code-lookup** — verifies that a verified lookup returns only the data for that code and nothing else.
- **Onboarding state machine** — verifies legal transitions and that selling is never gated by Stripe state.

Prior art: the codebase currently has minimal test infrastructure (the existing Netlify functions are thin and untested). This PRD is the point to introduce a small test setup for the two pure-logic engines; the UI and integration layers can be covered later.

## Out of Scope

- The checkout / payment processing internals — a downstream cart already exists; `cart-checkout` remains a handoff stub until the dev team wires it.
- The claims application itself (`5starservice.net`) — the dashboard links to it; a deeper authenticated handoff (pre-loading the client's details) is a future enhancement.
- EmailOctopus broadcast sending — list curation exists; sending campaigns is not part of this PRD.
- The MCP server described in `docs/db-plan.md`.
- Multi-channel outreach orchestration, promotional scripts beyond the toolkit, and zero-bounce email filtering — these are operational/marketing workstreams noted in the team email, not dashboard features.

## Further Notes

### Resolved decisions (2026-05-18)

1. **Independent Referral Contact payout — resolved.** They set up their *own* Stripe account and are paid directly. They are not anyone's employee, so direct payout does not step on a designer. Payout path is uniform: anyone who wants money (designer or referral contact) connects their own Stripe.
2. **Promo A wording — resolved.** The public `/partner` and landing copy will be reconciled to the designer-side framing (boosted commission, not a client-side comp).
3. **Promo A commission math — resolved.** The first deal earns **40%** — the 35% standard rate plus a flat 5% promo boost — capped at $5,000 of coverage value. The client pays full price.

### Sequencing recommendation

Per the playbook's "first version priority" — build the account/code machine and the admin console first so current leads stop leaking, before the full-featured dashboard. The attribution and promotions engines can be built and tested in parallel as pure modules.

### Related documents

- `docs/db-plan.md` — base lead schema, operational rules, ingestion architecture.
- `designer-plan-site/DEPLOY.md` — deploy + env var setup.
- `designer-plan-site/partner/index.html` — the public-facing partner info page that explains the four-step path; its content should stay consistent with the onboarding sequence above.
