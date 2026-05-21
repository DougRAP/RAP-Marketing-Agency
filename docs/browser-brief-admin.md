# Brief for claude browser — Designer Plan: Admin / Operator console

Hand this whole file to a claude browser agent. Also attach the live dashboard pages
`designer-plan-site/dashboard/index.html` and `designer-plan-site/dashboard/overview/index.html`
so the agent can copy CSS and visual register exactly.

---

## Your task

Design and produce **four self-contained HTML files** for the **operator console** of
Designer Plan — the internal screens RAP staff use to support designers, manage their
own work, and (admin-only) manage the team. Each file is a single standalone HTML with
all CSS in a `<style>` block and any JS in a `<script>` block. No external files, no
frameworks, no build step.

Files to produce:

| File | Page |
|---|---|
| `admin-home.html` | Operator landing — KPI strip, my designers, today's tasks, Omega, daily message |
| `admin-designer.html` | Single-designer operator view — mirrors a designer's own dashboard with operator chrome |
| `admin-designers-list.html` | Admin-only — all designers, multi-select, bulk-assign to agents |
| `admin-agents.html` | Admin-only — team members management |

## CSS — the rule, read twice

This console must look like a natural extension of the existing designer dashboard.

- Copy the design tokens and base styles from the attached dashboard files VERBATIM.
- Use ONLY these tokens. Do not invent colors, fonts, shadows, or radii.

```
--paper:#ffffff  --ink:#1a1815  --ink-65:rgba(26,24,21,.65)  --ink-45:rgba(26,24,21,.45)
--brown-deep:#3a2a1f  --rule:#e3d9c6  --rule-strong:#cdbf9f
--accent:#c4582a (terracotta)  --accent-soft:#f4e4d6
font display: "Inter Tight" (500/600)   font body: "Inter" (400/500)
Headlines: sentence case. Eyebrows: all-caps, letter-spaced. Buttons: 4px radius, quiet.
Light, airy, warm — never muddy.
```

New operator-specific classes are fine (operator bar, two-pane layout, data tables) but
must follow the same naming and spacing rhythm.

## DO NOT MODIFY EXISTING FILES

Every file in `designer-plan-site/dashboard/` is **locked, bug-checked, live**. Do not
modify any of them. You produce NEW admin files only. The existing dashboard pages are
your visual reference and CSS source — never your edit target.

## ANTI-DRIFT RULES — read carefully

The chief agent has had bad experiences with browser agents inventing new visual
language and we are not repeating that. This console must look like a quiet extension
of the existing dashboard, not a redesign.

- **No new fonts.** Inter Tight + Inter only.
- **No new spacing scale.** Reuse the existing `--sp-*` tokens.
- **No new color tokens.** The palette above is final.
- **No new shadow / radius / border treatments** beyond what the dashboard already uses.
- **No new icon style.** Use simple unicode glyphs or basic SVGs in the existing weight (the dashboard has minimal iconography — match that).
- **No clever animations.** Subtle fades and slides only, matching the existing motion tokens.
- **New patterns introduced by this brief** — operator bar, two-pane layout, data tables, slide-out panel — must each mirror the dashboard's existing visual rhythm in padding, borders, typography weight. When in doubt, copy a similar element from the dashboard and adapt.
- **If you reach for a value not in the dashboard's CSS, stop.** Ask before inventing.
- **If a section feels like it needs a fancy treatment to stand out** — it doesn't. Quiet wins.

Polish happens after integration, not at design time. Conservative beats clever.

## Responsive

**Desktop-first.** Inside agents and admins work at desks. Mobile breakpoints should
degrade gracefully (single-column collapse) but do not optimize for mobile at the
expense of desktop information density.

## Context

Designer Plan is a 36-month furniture protection program where interior designers earn
commission for offering plans to their clients. The operator console is the **internal
RAP tool** for the sales/service team that supports those designers. Three internal
roles use it:
- **agent** — handles a book of designers; can add notes, create/complete tasks, view all data
- **admin** — manages everything an agent does + designer assignments + team management + tells Omega the daily broadcast
- **sales** — manager-level view only. Identical UI to admin, but **read-only**: every edit control (add note, add task, complete task, assign, change role, tell Omega) is hidden or visibly disabled

There is also a **designer** role — they use the existing `/dashboard` and never see this console.

**Important scope clarification:** This console is for **sales and service support at
the designer-relationship level**. It is NOT a claim-management CRM — claims have a
separate system at `5starservice.net`. Don't surface claim-handling UI here.

## Visibility & access model

- All operator screens are gated by login. Not public.
- **Once logged in as agent/admin/sales, all team members see ALL designers and ALL
  notes/tasks.** No siloing. Assignment is a *responsibility flag* (who owns the
  relationship), not an access wall.
- "My designers" is a filter, not a permission boundary.
- Admins additionally see: designers-list management, agents/team management, and a
  "Tell Omega" affordance to author the daily broadcast that Omega delivers to all
  operators.

## Omega — global slide-out panel (present on every operator page)

Omega is the team's friendly AI assistant placeholder. It is **not** an inline card —
it's a **slide-out side panel** that opens from the right edge of the screen on click
of an Omega trigger in the operator bar.

### Trigger
On the operator bar (top-right area near `+ Task` / `+ Note`), place a small button:
a circle with the letter `O` in the brand's accent terracotta, label "Ask O". Clicking
it opens the panel.

### Panel layout

- **Position:** fixed right edge, slides in from off-screen (translateX animation, ~280ms).
- **Width:** ~400px on desktop, full-width on mobile.
- **Height:** **full page height** (top to bottom, behind the operator bar OR with operator bar still visible — your call; cleaner if it tucks under the operator bar so the bar stays usable).
- **Backdrop:** soft dim behind the panel, click-to-close.
- **Close:** an `×` in the top-right of the panel, plus Escape key.

### Panel content — top to bottom

**1. Omega header / greeting (sticky at top of panel)**

- Avatar circle with `O` inside (accent color).
- Name: "Omega" with a smaller "Your AI assistant" subtitle.
- Greeting text — use this **verbatim** (typo `disapear` corrected to `disappear` per Doug):
  > "Hi, I am Omega, your helpful AI assistant, just call me 'O'. You can ask me for help setting priorities for the day, if you missed anything, i can tell you a joke, and i will alert you from time to time about issues that concern both of us. I cannot make gold from lead or make your manager disappear...that is a joke. ask me a question to get started."
- Below greeting: a chat input "Ask O…" with a send button. Placeholder — no real backend.
- Three quick-action suggestion chips below the input:
  - "What are my priorities today?"
  - "Did I miss anything?"
  - "Tell me a joke"

**2. Today's alerts (scrollable middle section)**

Section title: "Today's alerts"

Omega broadcasts here. The list interleaves two sources:

(a) **Admin's daily broadcast message** — pinned at top, styled differently (small "Pinned from Doug" label). For agents and sales: read-only. Sample:
> *"Friday focus — please catch up the 4 pending-Stripe partners before EOD. Two have been waiting since last week."*

(b) **System-surfaced alerts** — Omega's auto-detected issues. Sample static cards (no real logic):
- "Maren Ellison: no contact in 18 days · last note 2026-05-01 · [Open designer]"
- "R. Diaz: Stripe pending for 7 days · [Open designer]"
- "3 plans purchased yesterday — all attributed correctly · [Open activity]"
- "Marcus Lo's Stripe payout completed · [Open designer]"

Each alert is a compact card with subject, one-line context, and an action link.

**3. "Tell Omega" button (admin and only admin) — sticky at bottom of panel**

- A button: `+ Tell Omega something to broadcast today`
- Click opens a small inline form within the panel: a textarea + "Post to today's alerts" button. The submitted message replaces the current pinned broadcast.
- Sales: this button is not shown.
- Agents: not shown.

### Default state

On first load of any operator page, the panel is **closed**. The trigger sits in the
operator bar. Users open Omega when they want it. Do NOT auto-open the panel on
landing — that would interrupt flow.

(Exception worth designing for, but mark as a Phase 2 consideration in code comments,
not built now: optional "auto-greet" on first login of the day. Skip for now.)

---

## The four pages — detailed

### Page 1 — `admin-home.html` — Operator landing

The home page after an operator logs in. No designer is selected.

**Sample logged-in user:** Tasha Reed, role: agent.

**Top: Operator bar** (sticky, full-width)
```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ [AGENT] Tasha Reed │ Designer: [▾ Search…]   │ + Task  + Note  │ ⊙ Ask O   │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```
- Left: role badge ("AGENT") + name
- Middle: a searchable designer dropdown (placeholder; populated from sample data)
- Right: `+ Task` and `+ Note` buttons (disabled in the no-selection state), then the `⊙ Ask O` Omega trigger (see Omega section above)

**Main body — two-pane layout**

Left rail (narrow, ~280px): **Designers list**
- Filter chips at top: `All` · `My designers` (default selected) · `No contact 14+ days`
- Search box
- Each row shows: name · studio · small badge with `count` of open tasks · `!` if any urgent or overdue
- Sample rows:
  - Maren Ellison · Ellison Interiors · 3 · `!` (selected highlight, but no main pane swap on this page — clicking would navigate to `admin-designer.html`)
  - Sasha Park · Park Studio · 1
  - Lia Banks · Banks & Co. · 0
  - R. Diaz · (pending) · 2
  - J. Whitman · (lead) · 0
  - (more 47)

Main pane: **Operator home** — the personal worklist

1. **KPI strip** (full-width band, four cards)
   - **Overdue** — large red badge — `4` — "Tasks past their due date"
   - **Due today** — yellow badge — `7` — "Today's worklist"
   - **Urgent open** — red badge — `2` — "High priority, regardless of date"
   - **Open total** — neutral — `23` — "Your queue length"
   Note: counts are across ALL designers, not just "my." Visibility is shared.

2. **Today's tasks** (assigned to me, due today)
   - 3-4 sample rows: title · designer · priority pill · due time · `✓ Done` button
   - Sample:
     - "Call Maren about Q3 closeout list" · Maren Ellison · normal · 11:00 AM · ✓
     - "Confirm R. Diaz's preferred Stripe email" · R. Diaz · high · 2:00 PM · ✓
     - "Note about Sasha's email" · Sasha Park · normal · 4:00 PM · ✓

3. **Recent team activity** (24h feed)
   - "Doug Wright posted today's message" · 8:30 AM
   - "Tasha Reed added a note on Maren Ellison" · 10:15 AM
   - "Lia Banks signed up via /partner-apply" · 11:02 AM
   - "Sasha Park completed Stripe onboarding" · 12:40 PM
   - Subtle, italic, smaller text. Feels like a social feed without being chatty.

4. **Your commission this week** (small widget, bottom-right or after the activity feed)
   - "Your commission this week so far: $147 — Details →"
   - Phase 2: real calculation. For now: hard-coded sample.

### Page 2 — `admin-designer.html` — Single-designer operator view

What an operator sees when they click into a specific designer. The closest visual
match to the existing `/dashboard/overview` page (the designer's main dashboard).

**Sample selected designer:** Maren Ellison · Ellison Interiors · account `DP-10042` ·
assigned to Tasha Reed · active partner.

**Top: Operator bar** (same as Page 1, but with the selected designer's name shown in
the dropdown and the `+ Task` / `+ Note` buttons enabled)

Operator bar gains the `⊙ Ask O` Omega trigger as on Page 1.

**Sticky operator banner** (just below operator bar, terracotta accent)
> ⌂ **Viewing as agent — Maren Ellison · Ellison Interiors** &nbsp;·&nbsp; *Read-only operator view* · [Exit view →]

**Below: two-pane layout**

Left rail: **Designers list** (same as Page 1, with Maren highlighted as the selected row)

Main pane: **Maren's dashboard, mirrored from `/dashboard/overview` content**, with two
operator additions:

1. **Each section header gets two small links**: `+ Note` and `+ Task`.
   These open a modal scoped to that section's subject. So a `+ Note` next to "My
   clients & plans" creates a note about the clients section; a `+ Task` next to a
   specific client row creates a task about that client.
   Subjects available: the designer themselves, individual clients in the activity
   table, the commission summary, the service section. Cover at least 3 of these.

2. **Operator timeline** — a new section at the bottom of the page titled
   **"Notes & tasks on this designer"**. Two-column body or unified timeline (your call
   — pick whichever reads cleaner). Each item is either a note (no due date, no status)
   or a task (due date, priority, status). Sample items:
   - **Task** — "Call about Q3 closeout list" · created by Tasha · due Tomorrow · normal · *Open* · [✓ Mark done]
   - **Note** — "Maren prefers email over phone after 4 PM" · Tasha · 2026-05-15
   - **Task** — "Send refer-a-designer link to her colleague Lena" · created by Doug · due 2026-05-20 · high · *Overdue* (red pill) · [✓ Mark done]
   - **Note** — "Joined the closeout zoom call — wants tier 3 as her default" · Doug · 2026-05-09
   - **Task** — "Confirm Stripe payout for J. Whitman" · *Done by Tasha on 2026-05-12* (struck through, grayed)

The rest of the page renders Maren's actual dashboard data — sample data identical to
the live `/dashboard/overview` page (commission $843 tracked, 3 sample plans in
activity table, both promotions, the toolkit, the support card). The operator can
SEE all of it. Per the visibility model.

### Page 3 — `admin-designers-list.html` — Admin-only designers management

Where admins assign designers to agents and manage the book of business.

**Top: Operator bar** with `[ADMIN] Doug Wright` as role badge.

**Page title row:**
- H1: "All designers"
- Right: filter controls — by agent (dropdown), by lifecycle status, by date range "Last contact"
- Search box

**Main body — single full-width data table** (no left rail; this is a management page)

Columns: ☐ (checkbox) · Name · Studio · Account # · Status badge · Assigned agent · Last contact · Open tasks · ⊙ Actions

Sample rows (~12 designers, mix of statuses):

| ☐ | Name | Studio | Account # | Status | Agent | Last contact | Open tasks |
|---|---|---|---|---|---|---|---|
| ☐ | Maren Ellison | Ellison Interiors | DP-10042 | Active partner | Tasha Reed | 4 days ago | 3 (`!`) |
| ☐ | Sasha Park | Park Studio | DP-10044 | Stripe invited | Tasha Reed | 1 day ago | 1 |
| ☐ | Lia Banks | Banks & Co. | DP-10047 | Active partner | (unassigned) | 12 days ago | 0 |
| ☐ | R. Diaz | (pending) | DP-10049 | Account created | Tasha Reed | today | 2 |
| ☐ | Marcus Lo | Lo Studio | DP-10038 | First sale | Bea Sanchez | 2 days ago | 0 |
| ☐ | J. Whitman | (no studio) | DP-10051 | Nurture | (unassigned) | 21 days ago | 1 (`!`) |
| … 6 more |

**Bulk-assign bar** (appears when 1+ rows checked, sticky bottom of table):
- "3 designers selected" · "Assign to agent: [▾ Tasha Reed]" · `[Apply]` · `[Cancel]`

Row-level actions in `⊙` column: view (links to `admin-designer.html`), reassign
(quick assign menu), archive.

### Page 4 — `admin-agents.html` — Admin-only team management

Where admins add/remove team members and see workload distribution.

**Top: Operator bar** with `[ADMIN] Doug Wright`.

**Page title row:**
- H1: "Team"
- Right: `[+ Add team member]` button (admin-only)

**Main body — data table**

Columns: Name · Email · Role · Active · Designers assigned · Tasks open · Tasks overdue · Joined

Sample rows:

| Name | Email | Role | Active | Assigned | Open | Overdue | Joined |
|---|---|---|---|---|---|---|---|
| Doug Wright | dwright@raptns.com | admin | ● | — | 2 | 0 | 2025-01-15 |
| Tasha Reed | treed@raptns.com | agent | ● | 18 | 23 | 4 | 2025-06-02 |
| Bea Sanchez | bsanchez@raptns.com | agent | ● | 14 | 11 | 1 | 2026-01-10 |
| Adrian Park | apark@raptns.com | admin | ● | — | 0 | 0 | 2025-09-22 |
| Mara Hill | mhill@raptns.com | sales | ● | — | 0 | 0 | 2026-03-05 |
| Sam Tran | stran@raptns.com | agent | ○ | 0 | 0 | 0 | 2025-08-14 |

Inline actions per row: edit role (dropdown), deactivate, view assigned designers
(filters `admin-designers-list.html` to that agent's book).

Bottom of page: a small "Add team member" form (modal-style or inline form) with
name, email, role select (`agent` / `admin` / `sales`). Disabled-looking but visually
present.

## Considerations

- **Information density matters.** This is an internal tool used 4+ hours a day.
  Don't waste vertical space. Compact rows, tight padding. But keep the typography
  and color palette of the brand — internal does not mean ugly.
- **Two-pane on pages 1 & 2.** The designers-list rail is identical between those
  pages. Pull it into shared markup mentally; rendering separately is fine.
- **Sticky banner inside main pane** on page 2 — the "Viewing as" banner sticks while
  the operator scrolls.
- **Empty states.** A "No tasks today — go enjoy your morning." kind of message when
  the today-tasks list is empty. Same for alerts, activity feed.
- **Accessibility.** Real headings, contrast ratios honored, labelled controls.
  Keyboard navigation (Tab through designers list, Enter to open).
- **No real backend.** All data is hard-coded sample data in the HTML. Inline JS
  objects holding the sample data are welcome (so logic wiring is straightforward
  later).
- **No designer dashboard files touched.** Confirm before delivery.

## Sample data — additional details

If you need more designers/tasks/notes than the brief lists, invent plausible ones.
Keep names realistic (not "John Doe"). Keep studios warm and design-y (not "Acme
Corp"). Keep commission numbers modest, not flashy.

## Deliverable

Four `.html` files. Self-contained. Same CSS system as the dashboard, plus
operator-specific classes in the same style. Desktop-first responsive. Do not drift.

Confirm before delivery: no files inside `designer-plan-site/dashboard/` were modified.
