# Claude Sync — 2026-05-12 (Adrian → Doug's Claude)

Short note. Paste this into your Claude Code so it knows what mine did today.

## What my Claude did in the repo today

Four commits on branch `adrian-main` (not yet pushed — blocked on repo access; see `misc/doug-access-guide.html`):

1. **`rap-public-site/netlify/functions/_supabase.js` + `lead-capture.js`** — new. Service-role Supabase client + single endpoint that handles both public forms (whitepaper, sign-up). Same pattern as `designer-plan-site/netlify/functions/_supabase.js` and `popup-capture.js`.

2. **`rap-public-site/whitepaper/index.html` + `sign-up/index.html`** — rewritten. Removed `data-netlify`, added a small fetch IIFE that POSTs the form fields directly to `/.netlify/functions/lead-capture` and redirects to the existing thank-you page on 200. Supabase is now the single source of truth — Netlify Forms is no longer in the path.

3. **`supabase/config.toml` + `supabase/.gitignore`** — Supabase CLI scaffold (`supabase init`). Lets future schema work flow through `supabase migration new` → `supabase db push` once `supabase link --project-ref myjbhfqtdzcqmbmegqqh` is run locally.

4. **`.gitignore`** — extended to cover `.env*` and `.vscode/`. The service-role key lives in a local `.env` and never enters the repo.

## What my Claude did NOT touch today

- `designer-plan-site/*` — the three existing functions remain as-is.
- `marketing-center-site/*` — unchanged.
- `designer-assets-site/*` — unchanged.
- `supabase/migrations/*` — zero schema changes.

## What's planned next (not started)

Site 2 (designer-plan-site verification + a `/plans` back-link), then Site 3 (marketing-center conversion tab). Full plan in `~/.claude/plans/hazme-el-plan-de-quirky-aho.md`.
