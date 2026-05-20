# Email to Adrian — Designer Plan DB unblock + status

**Subject:** Designer Plan — please unblock the DB writes when you can + what's new

---

Adrian,

Quick update on the Designer Plan site and a request to finish the database hookup when you have a window.

## What we need from you

The Netlify functions on `thedesignerplan.netlify.app` are reaching Supabase but every write fails with:

> `new row violates row-level security policy for table "leads"`

Two things would unblock everything:

**1. RLS — service-role write access.** The site's serverless functions are intended to write through the Supabase **service-role / secret key** (which normally bypasses RLS). With your current RLS lock, those writes are being denied even with that key. The tables the functions write to:

- `public.leads` (inserts on form submissions)
- `public.lead_events` (append-only event log)
- `public.partners` (insert on partner application)
- `public.email_list_members` (auto-add lead to the right list)
- `public.promo_claims`, `public.lookup_otps` (future, but useful to cover preemptively)

Either reopen RLS for `service_role` on those tables, or add explicit policies that allow it. Whatever pattern you prefer — let me know if you want a specific policy shape and I'll wire it.

**2. Netlify env var value.** The env var `SUPABASE_KEY` on the `thedesignerplan` Netlify site currently holds the **publishable / anon key** (46 chars, `sb_publishable_…`). The functions need the **secret / service_role key** (`sb_secret_…`). Once swapped, trigger one redeploy to pick up the new value.

The function code accepts either env-var name — `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_KEY` — so you can rename if cleaner.

## How to verify it's working

There's a temporary diagnostic endpoint that returns DB connectivity status without exposing secrets:

```
https://thedesignerplan.netlify.app/.netlify/functions/env-check
```

You want to see `"insert_ok": true` and `"insert_error": null`. Right now it reports the RLS violation.

Once it's green, please delete `designer-plan-site/netlify/functions/env-check.js` (it's a leak risk in production). Or tell me and I'll delete it.

## A live smoke test you can run afterward

```bash
curl -X POST https://thedesignerplan.netlify.app/.netlify/functions/popup-capture \
  -H "Content-Type: application/json" \
  -d '{"email":"adrian-smoke-test@example.com","source":"landing_popup"}'
```

Should return `{"ok":true,"lead_id":"…"}` and you should see a row in `leads` plus a `form_submitted` event in `lead_events`.

## What's changed on the site since we last spoke

Site is live at `thedesignerplan.netlify.app`. Major adds since you took the DB over:

- **Dashboard suite added** at `/dashboard`, `/dashboard/overview`, `/dashboard/clients`, `/dashboard/sales-tools`, `/dashboard/service`. Designed by a separate visual-design pass, public-link (no login wall yet), sample data for "Example Designer Studio." This is intentional so visitors can preview how the program works.
- **Site nav normalized** to one canonical set on every public page: **Home · Partner with us · Shop plans · Dashboard · File a claim · Log in**.
- **Partner application form rebuilt** at `/partner-apply` — state selector, ZIP, structured address, project-size and clients-per-year ranges, product-category checkboxes (Furnishings, Lighting, Upholstery, Decor, Rugs, Outdoor Furnishings, Other), preferred-contact-method field, free-text "anything else." Once writes work, this data lands in `leads` (structured columns) and `lead_events` (jsonb payload for fields without a dedicated column).
- **QA punch list** completed yesterday (10 items) — anchor fixes, footer label normalization, radio/checkbox CSS bug fixed, Promo A wording reconciled from "complimentary" framing to designer-side 40% boosted-commission framing, phone hrefs E.164, etc. Detail in `docs/qa-audit-2026-05-19.md`.

## New schema additions you should be aware of

Three migration files live in `supabase/migrations/`. The most recent — `20260518_dashboard_onboarding.sql` — adds:

- `account_number` (auto-generated `DP-10001`+) and `account_type` on `partners`
- A richer `lifecycle_status` enum matching the onboarding playbook vocabulary (New Lead → Account Created → Code Sent → Stripe Invited → … → Active Partner → Nurture)
- `assigned_agent`, `next_action_date`, `preferences`, `specializes_in[]`, `avg_job_size`, `extra_profile_notes`, `referred_by_partner_id` on `partners`
- New tables: `account_members` (team seats), `promotions` (seeded with first-plan-on-us and refer-a-designer), `promo_claims`, `lookup_otps`
- Updated `admin_leads_view` to include the new columns
- RLS policies on the new tables: service-role write, anon/auth read where appropriate

If you haven't applied that migration yet, please review it before running. It's additive — no destructive changes.

## What we'll tackle next

Once the DB is writing, we move on to:

- Wiring `/login` to real Supabase Auth (needs the **anon** key exposed to the client; I'll need that value to wire it)
- Building the admin lead console at `marketing-center-site/private/lists/` (already started; needs the DB)
- Promotions claim function

Thanks Adrian — when you have a window of an hour or so, you can probably knock this out. Ping me with questions or if you'd like me to draft policy SQL.

— Doug
