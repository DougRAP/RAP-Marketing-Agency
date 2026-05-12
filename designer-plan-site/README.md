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
├── login/                  ← /login — magic-link stub
├── _shared/                ← shared CSS partials (no build step yet)
├── assets/img/             ← brand imagery
├── js/
│   ├── auth.js             ← Supabase session check, sets window.DP_AUTH
│   └── cart.js             ← slide-in cart drawer, localStorage-backed
└── netlify/functions/
    ├── _supabase.js        ← shared service-role client
    ├── popup-capture.js    ← landing popup submissions
    ├── partner-apply.js    ← partner application submissions
    └── cart-checkout.js    ← cart checkout stub (dev team wires real backend)
```

## Funnel flow

- Both `/` and `/plans` are valid entry points; each links to the other. Not strictly linear by design — the email campaign sends to either.
- Popup on `/` triggers at 20s OR 40% scroll, first visit only (suppressed via sessionStorage).
- Cart drawer (`/plans` only) renders commission inline when a partner is logged in (`?partner=1` query string is a dev preview hook).
- `/partner-apply` is the dedicated application form. Logged-in partner state isn't required to view it.

## Related

- Supabase migration: [`../supabase/migrations/20260512_designer_plan_extensions.sql`](../supabase/migrations/20260512_designer_plan_extensions.sql)
- Schema overview & operational rules: [`../docs/db-plan.md`](../docs/db-plan.md)
- Admin lists UI: [`../marketing-center-site/private/lists/`](../marketing-center-site/private/lists/)
- File-a-claim destination: <https://5starservice.net>
