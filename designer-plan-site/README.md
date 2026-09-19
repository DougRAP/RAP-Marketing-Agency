# designer-plan-site

Static site for **thedesignerplan.com** — landing page, plans page, partner application, and supporting pages.

Part of the `RAP-Marketing-Agency` monorepo. Deployed as Netlify site #4. See [`DEPLOY.md`](./DEPLOY.md) for setup.

## Structure

```
designer-plan-site/
├── index.html              ← landing (was landing-a.html)
├── plans/                  ← /plans — shop plans + cart drawer
├── partner-apply/          ← /partner-apply — application form
├── about/                  ← /about
├── partnership/            ← /partnership — benefits page
├── terms/                  ← /terms
├── privacy/                ← /privacy
├── login/                  ← /login — password + magic link (live)
│   ├── confirm/            ← /login/confirm — holds the email token until a click
│   └── reset/              ← /login/reset — request a password reset
├── _shared/                ← shared CSS partials (no build step yet)
├── assets/img/             ← brand imagery
├── js/
│   ├── auth.js             ← Supabase session check, sets window.DP_AUTH
│   ├── dashboard.js        ← signed-in dashboard: account fields + sales from the BFF
│   ├── dashboard-clients.js ← clients page: prospects + sales, add client, send link
│   └── cart.js             ← slide-in cart drawer, localStorage-backed
└── netlify/functions/
    ├── _supabase.js        ← shared service-role client
    ├── _hmac.js            ← signed calls to the engine (designerplan.io)
    ├── _engine-dashboard.js ← one call: the partner dashboard from the engine
    ├── _resend.js          ← transactional email through the Resend API
    ├── _clients-merge.js   ← joins prospects with engine sales by email
    ├── public-config.js    ← anon key + publishable keys for the browser
    ├── account-bootstrap.js ← creates the partners row on first sign-in
    ├── popup-capture.js    ← landing popup submissions
    ├── partner-apply.js    ← partner application submissions
    ├── cart-checkout.js    ← checkout through the engine (HMAC signed)
    ├── dashboard-data.js   ← sales, commission, Stripe status, clients (contract B)
    ├── client-add.js       ← add a prospect (partner_clients)
    └── client-send-link.js ← email the plan link to a prospect
```

The engine side of the dashboard is documented in `docs/dashboard-data-contract.md`; parked follow-ups in `docs/phase-2-followups.md`.

## Funnel flow

- Both `/` and `/plans` are valid entry points; each links to the other. Not strictly linear by design — the email campaign sends to either.
- Popup on `/` triggers at 20s OR 40% scroll, first visit only (suppressed via sessionStorage).
- Cart drawer (`/plans` only) renders commission inline when `DP_AUTH.partner` is present, meaning a real session with a real partner row. The `?partner=1` preview hook was removed.
- `/partner-apply` no longer holds a form: it redirects. Anonymous goes to `/login`, signed in goes to `/dashboard/profile`. Accounts are created at `/login`.

## Related

- Supabase migration: [`../supabase/migrations/20260512_designer_plan_extensions.sql`](../supabase/migrations/20260512_designer_plan_extensions.sql)
- Schema overview & operational rules: [`../docs/db-plan.md`](../docs/db-plan.md)
- Admin lists UI: [`../marketing-center-site/private/lists/`](../marketing-center-site/private/lists/)
- File-a-claim destination: <https://5starservice.net>
