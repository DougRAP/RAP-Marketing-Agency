# Brief for claude browser — Designer Plan: Partner Dashboard

Hand this whole file to a claude browser agent. Also attach the live home page file
`designer-plan-site/index.html` so the agent can copy its CSS exactly.

---

## Your task

Design and produce **one self-contained HTML file** for the **partner dashboard** of
Designer Plan — the screen an interior designer uses to run their participation in the
program. Output a single `dashboard.html` with all CSS in a `<style>` block and any JS
in a `<script>` block. No external files, no frameworks, no build step.

## CSS — THE most important rule, read twice

This dashboard must look like it has always been part of the site. **Do not design a new
visual language.** You are handed `index.html` (the home page). You must:

- Copy its entire `<style>` block's design tokens and base styles and reuse them verbatim.
- Use ONLY these tokens. Do not invent colors, fonts, shadows, or radii. Do not "improve"
  the palette. Do not drift to generic dashboard styling (no blue accents, no Material,
  no Tailwind-grey). If you reach for a value that is not below, stop.

```
--paper:#faf7f1  --ink:#1a1815  --ink-65:rgba(26,24,21,.65)  --ink-45:rgba(26,24,21,.45)
--brown-deep:#3a2a1f  --rule:#e3d9c6  --rule-strong:#cdbf9f
--accent:#c4582a (terracotta)  --accent-soft:#f4e4d6
font display: "Inter Tight" (500/600)   font body: "Inter" (400/500)
Headlines: sentence case, never title case. Eyebrows: all-caps, letter-spaced.
Buttons: 4px radius, quiet. Generous white space. Light, airy, warm — never muddy.
```

New dashboard-specific classes are fine, but they must follow the same naming and
spacing rhythm as the home page. The page must drop into the site seamlessly.

## Context

Designer Plan is a 36-month furniture protection program. Interior designers become
partners, offer plans to clients at project closeout, and earn up to 35% commission.
The dashboard is where a partner operates: sees their link, their sales, their
commission, their onboarding progress, and selling materials.

## Access model (important)

- The dashboard is a **public link** — anyone can open it. It shows **dummy/sample data**
  for a fictional partner so visitors understand how the program works. This is a sales
  tool, not a private app.
- At the **top of the page** there is a **"Log in"** control. When a real designer logs
  in, their real data replaces the sample data. (Auth is not wired yet — the Log in
  control is visible but does not need to function; link it to `/login`.)
- Use the sample partner name **"Example Designer Studio"** throughout.

## Responsive

**One responsive page, mobile-first.** It scales up cleanly to desktop. Do not build a
separate desktop page or a "view on desktop" toggle.

## Functionality — modules the dashboard must include

Design these as clean, well-organized sections. Order them sensibly; the onboarding
checklist should be prominent near the top because it tells a new partner what to do.

1. **Account header** — partner name ("Example Designer Studio"), a status badge
   ("Active partner"), the account number (`DP-10042`), and the referral code
   (`example-designer-studio`) with a copy button. Also a copy button for the full
   client link (`thedesignerplan.com/plans?ref=example-designer-studio`).

2. **Onboarding checklist** — five steps, shown as a progress checklist. Steps 1-3 done,
   step 4 current, step 5 not started:
   1. Account created ✓
   2. Approved ✓
   3. Get your link & start selling ✓
   4. Schedule your onboarding call (current)
   5. Connect Stripe — last, optional ("only needed to get paid; your commission is
      tracked either way")
   Make clear that selling is never blocked by Stripe.

3. **Quick actions** — tiles/buttons: Copy client link · Download QR code · Shop plans ·
   Set up Stripe · Schedule a call · File a claim.

4. **Commission summary** — two figures: "Tracked (lifetime)" $843.00 and "Payable now"
   $0.00, with a note that payable unlocks once Stripe is connected.

5. **Your plans / activity** — a table of purchases attributed to this partner. Sample
   rows: J. Whitman / Premium Plus / 2026-05-09 / $349.00 / paid; A. Cole / Premium /
   2026-05-02 / $249.00 / paid; R. Diaz / Stain / 2026-04-21 / $149.00 / pending.

6. **Promotions** — two cards:
   - "First plan on us" — the partner's first specified plan earns a boosted 40%
     commission (35% + 5%), up to $5,000 of coverage value. A "Claim" action.
   - "Refer a designer" — share an invite link; earn a one-time 10% bonus commission
     on a referred designer's first purchase.

7. **Selling toolkit** — links to: plan one-pager (PDF), tier comparison sheet,
   pre-written client email copy, client text copy, talk tracks, success stories.

8. **Support** — a named partner-success contact, email `designer.programs@raptns.com`,
   phone `561-374-3147`, and a "Schedule a call" action.

## Considerations

- Tasteful, well-organized, easy to scan. This communicates how the whole program works,
  so clarity beats density.
- A new partner should immediately understand "what do I do next" (the checklist).
- Sample data is illustrative — keep it realistic and modest, not flashy.
- Accessibility: real headings, sufficient contrast, labelled controls.
- All sample/dummy values can be hard-coded in the HTML. A small inline JS object holding
  the sample data is welcome (it makes it easy to swap in real data later).

## Deliverable

One `dashboard.html` file. Self-contained. Uses the home page's CSS system verbatim plus
dashboard-specific classes in the same style. Mobile-first responsive. Do not drift.
