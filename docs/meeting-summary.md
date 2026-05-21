# Meeting Summary — RAP Marketing Agency

**Date of meeting:** 2026-05-12
**Participants:** Doug Wright, Adrian Barres
**Prepared by:** Adrian (via Claude Code)
**For:** Anyone joining this project who needs to get up to speed quickly
**Reading time:** ~5 minutes

---

## Why this document exists

Doug recorded the kickoff meeting for this round of work. Reading the full transcript is heavy — this is the high-level summary so a new contributor can be productive without watching the recording. The day's sync note for the Claude Code instances lives in `docs/claude-sync-2026-05-12.md` — that's where the actual file-by-file change log goes. **This document is the strategic context.**

---

## The strategic bet, in one paragraph

Doug is standing up a centralized **marketing agency** (the `marketing-center-site` in the repo) so that the sales team stops doing two things they're bad at: **creating content** and **managing lists**. With AI, Doug can produce an entire quarter's marketing plan and email content in half a day. The sales team is left with one job: **execution** — calling leads, closing sales, doing follow-up. To make that work, Doug needs **visibility** over what each lead does after it lands, and he doesn't have that today. The current funnel produces ~50% click-through on emails but near-zero conversion because nobody is following up and Doug can't tell who's dropping the ball. Fixing the lead-capture and visibility plumbing is the first round of work.

---

## The bigger picture (channel sequence)

1. **Designers first.** ~100,000 designers in the target market. One designer sale ≈ 12 dealer sales economically. This is the active phase right now.
2. **Direct-to-consumer next.** Same marketing-center infrastructure, just pointed at consumers. One direct sale ≈ 25 dealer sales.
3. **Dealers, eventually.** Doug wants to take email creation and list management away from dealers too, centralizing all marketing channels.

The endgame Doug sketched: if designers + direct-to-consumer scale, dealers become ancillary business and the org no longer depends on the dealer network.

---

## The new site: thedesignerplan.com

Doug built a fourth Netlify site (`designer-plan-site/` in the repo) as the e-commerce funnel for the Designer Protection Plan. It replaces the old `designer.io` (a static GoDaddy page with no commerce). Key design decisions:

- **It's a dual funnel, not linear.** `/` (storytelling landing) and `/plans` (product catalog with cart) can each stand alone — designers might send a client straight to `/plans`, or a prospect might land on `/` from an email and discover plans there.
- **Two cart paths, same UI:**
  - "Buy Direct" → consumer cart, no commission.
  - "Shop Plans" (from the designer-oriented landing) → cart shows the commission inline. If the visitor is a logged-in approved partner, commission attributes to their Stripe account. If not, they're invited to sign up or to buy direct.
- Doug deliberately doesn't gate the commission view behind login. If a consumer happens to find `/plans` and sees that designers earn a commission, "so what" — the target audience is designers, not the mass market.

---

## What the first round of work covers

The first round is **lead capture + visibility**. Three of the four sites get touched. The fourth (the image CDN) is untouched.

| Site | What changes |
|---|---|
| `rap-public-site` (public marketing) | Whitepaper and sign-up forms now write directly to Supabase. Was Netlify Forms only. |
| `designer-plan-site` (the new funnel) | Verify the three existing functions are writing correctly. Add a back-link from `/plans` to `/`. |
| `marketing-center-site` (Doug's admin) | Add a "Leads" tab to the existing admin UI so Doug and the call center can see every lead, assign owners, change status, and add notes. |
| `designer-assets-site` (CDN) | Untouched. |

Everything is going to a **single Supabase project** with two main tables: `leads` (one row per person) and `lead_events` (append-only history). Every form on every site writes to this same database with a `source` field that says where the lead came from. No new schema is being added in this round — the tables and seeds were already in place from earlier work.

The real Stripe checkout and the migration of designer accounts from Sora are explicitly **deferred** to later rounds, with Doug present.

---

## Key decisions captured in the meeting

1. **Don't reinvent the cart.** Reuse the consumer checkout cards Adrian already built; just plug them into the new site with two entry points (commission vs. direct).
2. **Don't migrate Sora accounts now.** Doug confirms most accounts on the old system are test accounts. Manual handling for the first real accounts; automate later once we see what's needed.
3. **Form for white-glove service** instead of mailto link. Three options: email, call link, scheduled video call (probably Calendly).
4. **Marketing-center is the source of truth** for all outbound campaigns. The sales team executes, doesn't create.
5. **Repauction stays separate.** It's a different model (rifle-shot, one-account-at-a-time). Not merged into this work.
6. **Repo will go private.** Doug needs to flip the visibility and grant Adrian write access — that's blocking the first push right now (see `misc/doug-access-guide.html`).
7. **Working agreement:** Doug stays the gatekeeper of `main`. Adrian works on `adrian-main` and feature branches, opens PRs, Doug merges.
8. **Sync via markdown notes.** Doug and Adrian both use Claude Code on the same directory; they exchange markdown summaries instead of trying to make the Claude instances talk to each other.

---

## Where to dig if you want more detail

These files in the repo will tell you everything you need to know, in order from least to most detailed:

| File | Purpose | Read time |
|---|---|---|
| `docs/meeting-summary.md` | This file — strategic context. | 5 min |
| `docs/claude-sync-2026-05-12.md` | What Adrian's Claude did today. Short — paste it into Claude Code. | 5 min |
| `docs/db-plan.md` | Original schema rationale, ingestion path, security checklist, operational rules between Doug and Adrian. The foundational design doc. | 30 min |

You can also find:

- The plan being executed: `~/.claude/plans/hazme-el-plan-de-quirky-aho.md` (mirror of the approved site-by-site plan)
- The strategic overview written earlier: `misc/estrategia-rap.html` (open in a browser, has diagrams)
- The Site 1 deploy doc: `misc/site-1-rap-public-site.html`
- Access setup guide for Doug: `misc/doug-access-guide.html`

---

## How to use Claude Code with this document

One-time setup, under 10 minutes:

### 1. Clone the repo locally (once Doug grants access)

```powershell
git clone https://github.com/DougRAP/RAP-Marketing-Agency.git
cd RAP-Marketing-Agency
```

### 2. Open it in Claude Code

If Claude Code isn't installed, instructions are at https://claude.com/claude-code. Once installed, open the project folder:

```powershell
claude
```

Claude Code will load with the repo as its working directory. It picks up the existing `CLAUDE.md` at the root, which is a primer about the codebase.

### 3. Point Claude at this summary

Either:
- Open `docs/meeting-summary.md` directly so Claude reads it on demand.
- Or create a personal working file (e.g. `docs/my-meeting-notes.md`) with this content pasted in.

### 4. Ask Claude Code for a high-level summary

Literally type:

> "Read `docs/meeting-summary.md` and give me a high-level summary of the strategy and what's expected of me."

Claude will produce a more digestible version tailored to the task at hand. Useful follow-up questions:

- "What's the difference between rap-public-site and designer-plan-site?"
- "Where do leads from the whitepaper form end up?"
- "What is Doug's complaint about the sales team and why does it matter for the work?"

### 5. When a specific task arrives

Tell Claude Code what was assigned. Claude already has the repo loaded and this summary as context — it can plan the work, suggest files to change, and walk through the implementation step by step. Same way it works for Adrian and Doug.

---

## One nuance to keep in mind

Doug specifically said in the meeting that **the wireframes and design plan from the original `db-plan.md` and earlier docs deviated from what's actually in the repo now**. He said: *"we have to consider these versions locked and not let it want to go back to the plan."* In other words: trust the code that's currently in the repo, not the older design docs. If Claude Code suggests "the plan says we should do X" and the code already does Y, the code wins.

---

## TL;DR

- Doug is centralizing marketing into one place and stripping content+list-management from the sales team.
- First job is to fix lead capture and give Doug visibility, because the funnel converts at zero today.
- There's a new e-commerce site (`thedesignerplan.com`) replacing the old `designer.io`.
- Three sites in the repo are getting touched in this round; one is untouched (the image CDN).
- Adrian is doing the engineering of this round; the file-by-file change log lives in `docs/claude-sync-2026-05-12.md`.
- Open Claude Code on the repo, point it at `docs/meeting-summary.md`, ask follow-up questions.

Contact Adrian (`abarres@raptns.com`) or Doug directly if anything is ambiguous before starting.
