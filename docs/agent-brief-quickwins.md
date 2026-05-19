# Brief — Quick-wins implementation agent

**Audience:** Fresh Claude Code agent assigned a limited, mechanical implementation pass.
**Repo:** `DougRAP/RAP-Marketing-Agency`, local at `C:\Newco\AI\Designer\rap-designer-agency`.
**Date issued:** 2026-05-19
**Issued by:** Chief agent (current session) on Doug's behalf.

---

## Read these in order before touching code

1. `HANDOFF.md` — project state, active blockers, hard rules.
2. `docs/qa-audit-2026-05-19.md` — the audit; this brief implements a subset.
3. This file.

Do not read anything else unnecessary — token discipline matters.

---

## Your role

**Implementation only.** No design decisions. No scope expansion. No improvements.

You are completing 10 specific items from the QA audit. Every item has a file path, line number, and exact fix. If an item turns out to be ambiguous, **stop and ask Doug** in chat — do not guess.

---

## Hard rules (non-negotiable)

1. **Do NOT touch anything not on the list below.** No incidental cleanups. No "while I'm here" edits.
2. **Do NOT modify CSS design tokens** (`--paper`, `--ink`, `--accent`, fonts, etc.) anywhere.
3. **Do NOT change the canonical nav structure.** It is now: Home · Partner with us · Shop plans · Dashboard · File a claim · Log in. Don't add, remove, or reorder.
4. **Do NOT create new CSS files** or new shared partials. Inline styles in the existing pages where needed.
5. **Commit atomically** — one logical commit per group (suggested groups below), or one commit covering all 10 items if simpler. Push at the end. Don't force-push, don't amend, don't skip hooks.
6. **Use the standard commit message format** with the trailing line `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
7. **Stop conditions:** if anything is ambiguous, if a file looks different from what this brief says, or if a fix uncovers a deeper problem — STOP and report to Doug in chat. Do not improvise.

---

## Skill to use (optional)

After all edits, before pushing, you may run **`gstack /review`** to sanity-check the diff. It needs the gstack browser binary built (the skill's preamble handles setup). Not required, but it's the right tool for a pre-landing diff review. Skip if it adds friction.

---

## Out of scope — kick back to Doug if encountered

- Real prices for tier 1/2/3 or care kits (the `$[XX]` placeholders)
- The `/care/fabric|leather|wood|carpet-rug` page builds
- Anything requiring a design or product decision
- The RLS / env-var blockers (Doug + Adrian own those)
- The Admin and Partner-With-Us page rewrites (separate workstreams)

If you finish the 10 items quickly and have spare capacity, **stop**. Do not start anything else.

---

## The 10 items

### Item 1 — H3 — Add `#how-it-works` anchor to landing

**File:** `designer-plan-site/index.html`
**Why:** A link `/#how-it-works` exists (referenced from elsewhere) but no `id="how-it-works"` exists on the landing.
**Fix:** Find the section beginning with the eyebrow "How it works" and headline "Three quiet steps. Then we take it from there." Add `id="how-it-works"` to that `<section>` element.

### Item 2 — H4 — Add 4 missing anchor IDs to dashboard overview

**File:** `designer-plan-site/dashboard/overview/index.html`
**Why:** `dashboard/index.html` lines 761, 768, 775, 782 link to `/dashboard/overview#clients`, `#commission`, `#service`, `#sales`. None of those IDs currently exist on the overview page.
**Fix:** Open `dashboard/overview/index.html`. Find the four sections that correspond to:
- the **clients / your-plans / projects** section → add `id="clients"`
- the **commission** section → add `id="commission"`
- the **service / claims** section → add `id="service"`
- the **sales tools / toolkit** section → add `id="sales"`

If a section has an existing id (e.g. `id="clients-table-title"` on an inner `<h2>`), still add the new `id` to the wrapping `<section>` so deep-linking lands at the section's top. Don't remove any existing IDs.

If a section is not clearly identifiable, stop and ask Doug.

### Item 3 — H5 — Footer "Login" → "Log in" on 7 pages

**Files and lines:**
- `designer-plan-site/index.html:1574`
- `designer-plan-site/plans/index.html:1682`
- `designer-plan-site/dashboard/index.html:934`
- `designer-plan-site/dashboard/clients/index.html:599`
- `designer-plan-site/dashboard/overview/index.html:1165`
- `designer-plan-site/dashboard/sales-tools/index.html:505`
- `designer-plan-site/dashboard/service/index.html:503`

**Fix:** Each line is a footer `<li><a href="/login">Login</a></li>`. Change `Login` to `Log in` (two words, lowercase 'i').

### Item 4 — H6 — Radio/checkbox CSS specificity fix

**File:** `designer-plan-site/_shared/_partials.css`
**Lines:** 145–153
**Current rule:**
```css
form.simple-form input,
form.simple-form textarea {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--rule-strong);
  border-radius: 4px;
  background: var(--paper);
  font: inherit;
  color: var(--ink);
}
```
**Fix:** Change the `input` selector to exclude radios and checkboxes:
```css
form.simple-form input:not([type="radio"]):not([type="checkbox"]),
form.simple-form textarea {
```
Do the same on the `:focus` rule directly below (line 155–160) — apply the same `:not()` exclusions to its `input` selector. The radios and checkboxes will then inherit browser defaults plus the existing `.check-opt input, .radio-opt input { width:16px; height:16px }` rule on the partner-apply page.

### Item 5 — H8 — Promo A wording reconciliation

**The decision (per PRD `docs/dashboard-onboarding-plan.md` and HANDOFF.md):** The client pays full price; the designer earns a boosted 40% commission (35% standard + 5% promo) on their first specified deal, capped at $5,000 of coverage value. The "complimentary" framing was rejected.

**Replacement copy library — use the closest variant for each occurrence:**

- **SHORT (CTAs, hero subheads, single-line):**
  > Your first specified deal earns a boosted 40% commission — the value of a free plan, up to $5,000 of coverage.

- **MEDIUM (welcome-benefit blocks, popup):**
  > Your first specified deal earns a boosted 40% commission — the 35% standard rate plus a 5% promo boost, capped at $5,000 of coverage value. Claim it on your dashboard and tell us the client.

- **LONG (final-CTA paragraphs):**
  > If you're an interior designer specifying furniture for clients, becoming a partner unlocks up to 35% commission on every plan you sell — and your first deal earns a boosted 40% (35% + 5%), capped at $5,000 of coverage value. The client pays full price. The application takes two minutes.

**Occurrences to rewrite:**

| File | Line | Current text starts with | Use variant |
|---|---|---|---|
| `designer-plan-site/index.html` | 1339 | "Approved studios receive their first plan complimentary…" | MEDIUM |
| `designer-plan-site/index.html` | 1605 | "Become a partner today and we'll cover your first client's plan, complimentary…" | MEDIUM |
| `designer-plan-site/partner/index.html` | 186 | "first plan complimentary — up to $5,000 of coverage" | SHORT |
| `designer-plan-site/partnership/index.html` | 39 | "receive their first plan complimentary" | MEDIUM |
| `designer-plan-site/plans/index.html` | 1303 | "the first plan is complimentary. If you're buying a plan today…" | MEDIUM |
| `designer-plan-site/plans/index.html` | 1600 | "your first plan is complimentary. The application takes two minutes." | LONG |
| `designer-plan-site/dashboard/index.html` | 867 | "Approved studios receive their first plan complimentary." | MEDIUM |

Also check the `<meta name="description">` lines in `partner-apply/index.html:7` and `partnership/index.html:7` — both contain "complimentary first plan" language. Update to: *"Approved studios earn up to 35% commission and a boosted 40% on their first deal."*

The headline phrase **"Your first plan, on us — up to $5,000 of coverage"** can stay where it appears (it works for both framings). It's the surrounding body copy that needs to shift to designer-side.

### Item 6 — M1 — Phone format standardization

**Standard:** `tel:+15613743147` (E.164 with `+1` country code)
**Files affected (13 occurrences):**
```
grep -rn 'tel:5613743147' designer-plan-site/
```
Run that, then for each match, change `tel:5613743147` to `tel:+15613743147`. The visible text (e.g. "561-374-3147" or "Call RAP") stays unchanged — only the href value.

Do not change the 2 existing `tel:+15613743147` occurrences.

### Item 7 — M7 — `/partnership` apply button

**File:** `designer-plan-site/partnership/index.html`
**Line:** 51
**Current:** An `<a>` tag with `class="placeholder"` and many inline styles simulating a primary button.
**Fix:** Replace the entire `<a>` tag with:
```html
<a href="/partner-apply" class="btn-primary">Apply to the partner program <span class="arrow">&rarr;</span></a>
```
No inline styles. The `.btn-primary` class is defined in `_shared/_partials.css` (line 161+).

### Item 8 — M8 — `/login` env-var note correction

**File:** `designer-plan-site/login/index.html`
**Line:** 37
**Current:**
```html
<strong>Stub UI.</strong> Magic-link auth via Supabase will be wired by the dev team once <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> are configured. The form below is a working placeholder.
```
**Fix:** Replace with:
```html
<strong>Stub UI.</strong> Magic-link auth via Supabase will be wired once the Supabase anon (publishable) key is exposed to the client. The form below is a working placeholder.
```
We removed the specific env-var reference because the actual implementation is undecided.

### Item 9 — M9 — Delete `_shared/page-shell.html`

**File:** `designer-plan-site/_shared/page-shell.html`
**Action:** Delete the file. It contains only a comment, was never used, no other file references it.
```bash
rm "designer-plan-site/_shared/page-shell.html"
git rm "designer-plan-site/_shared/page-shell.html"   # or just include the deletion in `git add -A`
```

### Item 10 — M10 — Dashboard overview `href="#"` placeholders

**File:** `designer-plan-site/dashboard/overview/index.html`
**Lines:** 920, 1097, 1102, 1107
**Buttons:**
- Line 920: `<a class="status-link" href="#">Find my account</a>`
- Line 1097: `<a href="#" class="btn">Read story</a>` (inside a card)
- Line 1102: `<a href="#" class="btn">Read tip</a>` (inside a card)
- Line 1107: `<a href="#" class="btn" data-action="subscribe">Subscribe</a>` (inside a card)

**Action:** For each, replace the `href="#"` with `href="/dashboard"` (safe inert destination that won't 404) AND add `aria-disabled="true"` AND add `title="Coming soon"`. Example:
```html
<a class="status-link" href="/dashboard" aria-disabled="true" title="Coming soon">Find my account</a>
```
This keeps the buttons visually present (sample-data dashboard is illustrative) while preventing the dead-link UX of `href="#"` jumping to top.

---

## Suggested commit grouping

Two or three commits is fine. Suggested:

1. **"Fix dead links and missing anchors"** — Items 1, 2, 10
2. **"Normalize copy and labels"** — Items 3, 5, 8
3. **"Fix form CSS, phone format, and cleanup"** — Items 4, 6, 7, 9

Or a single commit covering everything if that reads cleaner.

Push to `main` when done.

---

## After you finish

1. Confirm in chat: which items completed, the commit SHA(s) pushed, anything you stopped on.
2. Update `HANDOFF.md` if appropriate — add a brief line under a new "Recently completed" section noting the quick-wins batch landed.
3. **STOP.** Do not pick up the next workstream. The chief agent will direct what's next.

If you finish in a fraction of expected tokens, that's the desired outcome — return budget to the chief agent.

---

## Don't

- Don't refactor anything.
- Don't change colors, fonts, spacing, or any design tokens.
- Don't reorganize files.
- Don't add new dependencies.
- Don't run migrations.
- Don't touch Netlify or Supabase config.
- Don't update the PRD or any other doc beyond the small HANDOFF.md note above.
- Don't optimize images.
- Don't fix bugs not on this list, even obvious ones — add them to a `docs/qa-followups.md` instead.
- Don't ask the chief agent — ask **Doug** if anything is ambiguous.
