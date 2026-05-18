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

- Lives as a **gated section of the marketing-center site** (`/private/...`), reusing the existing Basic Auth gate. One internal home, to keep the team focused.
- Capabilities: lead/signup list with filters (status, source, assigned agent); create a lightweight account from minimal fields (Faire-style short form — name, email, studio, role, source); assign owner and next-action date; click-to-call and log a call; generate code + send welcome in one action; view and nudge Stripe status; view full event history; per-designer notes (timestamped, attributed) and an agent-only preferences field never shown to the designer.
- **Status vocabulary** (from the playbook): New Lead → Account Created → Code Sent → Buy Now Link Sent → Stripe Invited → Stripe Complete → First Sale → Active Partner → Nurture.

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
