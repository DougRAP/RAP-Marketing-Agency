# Designer Plan — deploy guide

Site #4 in the `RAP-Marketing-Agency` monorepo. Publishes from `designer-plan-site/`.

## What this site is

| | |
|---|---|
| Repo | `DougRAP/RAP-Marketing-Agency` (existing) |
| Local path | `designer-plan-site/` (new) |
| Pages | `/`, `/plans`, `/about`, `/partnership`, `/terms`, `/privacy`, `/login`, `/partner-apply` |
| Functions | `designer-plan-site/netlify/functions/` (popup-capture, partner-apply, cart-checkout) |
| Database | Same Supabase project as the public marketing site |
| Email | EmailOctopus — lists managed in the marketing-center admin UI |

## One-time Netlify setup

> Per `docs/db-plan.md`, deploy settings live in the Netlify dashboard, not in committed `netlify.toml` files. The steps below follow the same pattern as the existing three sites.

1. **Create the site** — Netlify dashboard → "Add new site" → "Import from Git" → pick `DougRAP/RAP-Marketing-Agency`.
2. **Site settings → Build & deploy → Build settings:**
   - Base directory: *(leave blank)*
   - Build command: *(leave blank — static site)*
   - **Publish directory:** `designer-plan-site`
   - **Functions directory:** `designer-plan-site/netlify/functions`
3. **Site settings → Build & deploy → Branches:** deploy from `main` only (fast-forward, matching the existing three sites).
4. **Domain settings → custom domain:** add `thedesignerplan.com` (or whatever final domain is chosen). Netlify auto-provisions Let's Encrypt.
5. **Site settings → Environment variables:** add
   - `SUPABASE_URL` — from the Supabase project's API page
   - `SUPABASE_SERVICE_ROLE_KEY` — from the Supabase project's API page (**server-side only — never exposed in client JS**)
   - `SUPABASE_ANON_KEY` — the publishable / anon key from the same API page. Served to the browser via `/.netlify/functions/public-config`. Safe to expose: it's gated by Row-Level Security on every table.
   - `STRIPE_PUBLISHABLE_KEY` — *(optional today)* Stripe's client-side key. `public-config` serves it when present and omits it when absent, so checkout degrades rather than breaking.
   - `EMAILOCTOPUS_API_KEY` — *(optional, for when list-sync is wired)*

   **Watch `SUPABASE_SERVICE_ROLE_KEY` in particular.** If it is wrong, the failure is silent: `account-bootstrap` returns 401, `auth.js` treats that as non-fatal and carries on, and the partner ends up signed in with **no `partners` row**. The symptom is a dashboard with no account number, not an error. This cost a day in September 2026. To check it directly:

   ```bash
   curl -X POST https://thedesignerplan.com/.netlify/functions/account-bootstrap      -H "Authorization: Bearer <a real user JWT>"
   # 201 or 200 = healthy. {"error":"invalid_token","detail":"Invalid API key"} = the key is wrong.
   ```

## Supabase Auth — one-time dashboard config (magic link)

Required for `/login` magic-link sign-in. Supabase dashboard → **Authentication → URL Configuration**:

1. **Site URL** — must be `https://thedesignerplan.com`. A fresh Supabase project ships with `http://localhost:3000`, and if it is left there **every magic link sent from production points at the recipient's own machine**. That is not a visible error: Supabase silently falls back to the Site URL whenever a redirect target is not allow-listed, so the symptom is "the link does nothing", not an error message. This project ran that way from May to September 2026. `{{ .SiteURL }}` in the email templates resolves to this value.
2. **Redirect URLs (allow-list)** — every origin that should be allowed as the magic-link redirect target. Add all of:
   - `https://thedesignerplan.com/dashboard`
   - `https://thedesignerplan.com/login`
   - `https://thedesignerplan.netlify.app/dashboard`
   - `https://thedesignerplan.netlify.app/login`
   - `https://deploy-preview-*--thedesignerplan.netlify.app/dashboard` *(Netlify preview deploys, optional)*
   - `http://localhost:8888/dashboard` *(for `netlify dev`)*
   - `http://localhost:8888/login`
   - `<each origin>/login/confirm` *(required since A1 — this is where every email link now lands)*

   Match what the code actually asks for, **including the trailing slash**: `js/auth.js` passes `origin + '/dashboard/'`. A `<origin>/**` wildcard covers all of it and is the simplest thing that works.

Without these the magic-link redirect lands on Supabase's default error page.

3. **Email templates — no longer optional.** The defaults use `{{ .ConfirmationURL }}`, a single-use GET that corporate link scanners spend before the recipient ever clicks. Three templates must point at `/login/confirm` instead: Magic Link, Confirm signup, and Reset Password. The exact HTML is in **`designer-plan-site/docs/email-templates.md`**, which is the authoritative copy since the dashboard is not under version control.

   Note that the test suite passes whether or not this was done, because it mints its own tokens. Editing these templates is the step that actually ships the fix.

4. **Providers → Email → Require current password when changing password: off.** A partner who only ever used the magic link has no current password to supply, so turning this on makes it impossible for them to create their first one, and breaks recovery too.

5. **Providers → Email → Email OTP expiration: 900 seconds.** The default hour is a long time for a live token to sit in an inbox.

## Auth email delivery — Resend

Supabase's built-in mailer is capped at a couple of messages per hour and shares
its sending reputation with every other project on it. It is not usable for
sign-in email. Auth mail goes through Resend instead, configured in Supabase
under Authentication → Emails → SMTP Settings.

| Setting | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` (the literal word, not an email address) |
| Password | the Resend API key (never in this repo) |
| Sender email | `no-reply@send.thedesignerplan.com` |
| Sender name | `Designer Plan` |

**Why a `send.` subdomain and not the root.** It isolates sending reputation
from the root domain and avoids colliding with the records GoDaddy already
manages in that zone. DNS for `thedesignerplan.com` is at GoDaddy.

The verified records, created when the domain was added in Resend:

- `MX` on `send.send.thedesignerplan.com` → `feedback-smtp.us-east-1.amazonses.com`, priority 10 (bounces)
- `TXT` on `send.send.thedesignerplan.com` → `v=spf1 include:amazonses.com ~all`
- `TXT` on `resend._domainkey.send.thedesignerplan.com` → the DKIM public key

**There is a pre-existing DMARC record** on `_dmarc.thedesignerplan.com` with
`p=quarantine`, put there by GoDaddy and not by us. Consequence worth knowing
before you debug anything: with a quarantine policy, mail that fails SPF or
DKIM alignment goes quietly to the junk folder with **no bounce**. A broken
DKIM record shows up as "designers are not receiving the sign-in email", not as
an error in any console. Check spam before assuming the mail never sent.

Verify the DNS from anywhere, no dashboard access needed:

```bash
nslookup -type=TXT send.send.thedesignerplan.com
nslookup -type=MX  send.send.thedesignerplan.com
nslookup -type=TXT _dmarc.thedesignerplan.com
```

Delivery logs live in the Resend dashboard; rejection reasons live in Supabase
Auth logs. One or the other will explain any missing email.

Also: **turn off click tracking** in whatever sends these. An email provider
that rewrites links to route them through its own tracker breaks the token in
the URL.

## One-time Supabase setup

1. Run the migration on the existing Supabase project (same project the public marketing site uses):
   ```bash
   # via Supabase CLI
   supabase db push
   # or via Studio: paste the SQL from supabase/migrations/20260512_designer_plan_extensions.sql
   ```
2. Verify the new tables exist: `partners`, `plans`, `orders`, `email_lists`, `email_list_members`.
3. Verify the new view exists: `admin_leads_view`.
4. Confirm seed plans loaded (three rows in `public.plans`).

## marketing-center-site changes (also needs a one-time toggle)

The admin lists page lives at `https://rap-marketing-center.netlify.app/private/lists/`. It calls a new Netlify Function. The marketing-center site previously had no functions, so:

1. Netlify dashboard → marketing-center site → Build & deploy → set **Functions directory** to `marketing-center-site/netlify/functions`.
2. Add the same env vars as the designer-plan site (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

## Local development

Static HTML — open `designer-plan-site/index.html` directly in a browser to preview the landing page. For function testing locally:

```bash
cd designer-plan-site
netlify dev --dir . --functions netlify/functions
```

This serves the static site at http://localhost:8888 with functions live.

## Pre-launch placeholders to swap

- `designer-plan-site/index.html` — hero `<img>` is a placeholder Unsplash URL marked `REPLACE-BEFORE-LAUNCH`. Swap for licensed photography.
- `designer-plan-site/plans/index.html` — hero photo same note.
- `designer-plan-site/index.html` — testimonial block is marked `Placeholder — replace before launch`. Swap for a real designer quote and attribution.
- `designer-plan-site/index.html`, `plans/index.html` — tier prices show `$[XX]` — swap for actual pricing. Cart prices in `plans/index.html` are placeholder `data-price-cents` values (14900, 24900, 34900).
- `designer-plan-site/terms/index.html`, `privacy/index.html` — sections marked `[REVIEW]` need legal sign-off.

## After deploy — smoke tests

1. Marketing-center private page still loads at `/private/` and the weekly downloads still work (do not regress per the db-plan operational rules).
2. `/` renders, popup fires at 20s or 40% scroll, submission writes a row to `leads` and a row to `lead_events` with `source='landing_popup'`.
3. `/plans` renders, "Add to cart" opens the cart drawer, item persists on reload (localStorage).
4. With a session and a `partners` row, `/plans` shows the commission banner in the cart drawer; anonymous does not. (The `?partner=1` hook was removed.)
5. `/partner-apply` redirects: anonymous to `/login`, signed in to `/dashboard/profile`. Account creation is tested from `/login` instead — see the auth checks below.
6. `/private/lists/` on the marketing-center site shows the four seeded email lists with member counts; adding/removing a lead works.


### Auth checks

6. `/.netlify/functions/public-config` returns 200 with `url` and `anonKey`. A 500 means `SUPABASE_ANON_KEY` is missing and every page is stuck in stub mode.
7. `/login` loads and the console shows no `[auth] Supabase JS not loaded`.
8. Request a sign-in link. The sender is `Designer Plan <no-reply@send.thedesignerplan.com>` and it arrives in the inbox, not in spam.
9. **Use a Microsoft 365 address, not only Gmail.** A personal mailbox has no link scanner, so it proves nothing about the problem `/login/confirm` exists to solve. Wait a minute after the mail arrives, then click.
10. The link lands on `/login/confirm`, which does nothing until the button is pressed. Pressing it signs you in and lands on `/dashboard/`.
11. First sign-in creates a `partners` row with an `account_number`. The dashboard shows that number, not a dash.
12. Set a password at `/dashboard/profile`, sign out, and sign back in with it from `/login`.
13. `/login/reset` answers the same thing for a registered address and an unknown one.
14. Security headers are live: `curl -sI https://thedesignerplan.com/login/confirm` shows `X-Frame-Options: DENY` and `Cache-Control: no-store`. These cannot be checked locally, because `netlify dev` serves through a simple static server that ignores `_headers`.
15. `npm run test:e2e` is green.

## Dev-team handoff TODOs

The dev team owns these:

1. ~~**Real auth** — uncomment the Supabase block in `designer-plan-site/js/auth.js` and add `SUPABASE_URL` + `SUPABASE_ANON_KEY` as inline `window.*` values at the top of pages that need auth (or via a build step).~~ **Done.** `auth.js` is live; config served via `netlify/functions/public-config.js`. `/login` offers password and magic link; email links land on `/login/confirm`. Dashboard pages do **not** redirect: they switch between a public preview and the signed-in view via `js/dashboard.js`. `DP_AUTH.requireAuth()` exists for pages that should be closed, and only `/dashboard/profile` uses it. Requires `SUPABASE_ANON_KEY` env var and Supabase Auth URL Configuration above.
2. **Real checkout** — replace the stub in `designer-plan-site/netlify/functions/cart-checkout.js` with the actual checkout integration (Stripe Checkout session creation, or the existing cart backend handoff). Should return `{ checkout_url: <url> }`.
3. **EmailOctopus sync** — when an email list has an `emailoctopus_id`, member adds/removes should also call EmailOctopus's API. Use `EMAILOCTOPUS_API_KEY` env var. The admin UI already shows the column; just needs the API calls in `marketing-center-site/netlify/functions/admin-leads.js`.
4. **Partner-approval workflow** — currently `partners.status` is set to `pending` on application. Build an admin tool (or a thin "approve" button in `/private/lists/` or a sibling page) that flips `status` to `approved`, sets `approved_at`, sends the welcome email, and moves the lead from the `designers-pending` to `designers-partners` list.
5. **Claims app integration** — `https://5starservice.net` is the destination today. If a deeper SSO-style handoff is desired (designer logs into Designer Plan, clicks "File a claim", lands authenticated on 5starservice), that's a future scope.
