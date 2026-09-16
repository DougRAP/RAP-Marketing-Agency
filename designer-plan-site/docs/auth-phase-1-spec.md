# Auth Phase 1 — spec

**Status:** approved to build, 2026-09-16
**Scope:** A1 confirmation page, A2 password sign-in, A3 password recovery
**Out of scope:** everything in phases 2 to 4 of the roadmap

---

## 1. The problem

Microsoft Defender for Office 365 (and Proofpoint, Mimecast, and every other
corporate link scanner) fetches the links inside incoming email to inspect them.
Supabase's default `{{ .ConfirmationURL }}` is a GET that consumes a single-use
token, so the scanner burns it. By the time the human clicks, Supabase answers
`otp_expired`.

Confirmed on 2026-09-16: a sign-in link sent to `@raptns.com` (Microsoft 365)
failed, while the same link to `@rapqa.com` (Mailgun, no scanner) worked.

Supabase documents this exact failure and the fix. This spec implements the fix.

## 2. Decisions and where they come from

| Decision | Source |
|---|---|
| Keep the magic link, do not replace it with a 6-digit code | Adrian, 2026-09-16: a link is easier for people than remembering a password |
| Add password as an alternative, not as a replacement | Doug, 2026-05-28 call: "I give them two choices here, enter your password or get a magic link" |
| Offer setting a password, never force it | Adrian, 2026-09-16 |
| Minimum password length stays at 6 | Adrian, 2026-09-16: "no compliquemos esto, esto tampoco es una cosa bancaria" |
| Confirmation requires a real click | Security review: only a human gesture keeps a scanner out |

**This supersedes one line of the PRD.** `docs/dashboard-onboarding-plan.md:108`
says a password is introduced *only* when a partner commits to Stripe, as the
"this is now a money account" signal. Doug's 2026-05-28 decision replaced that:
password is available to everyone from the start. The PRD line is now historical.

## 3. A1 — the confirmation page

### Route

`designer-plan-site/login/confirm/index.html`, served at `/login/confirm`.

### Contract

The email links to `{{ .SiteURL }}/login/confirm?token_hash={{ .TokenHash }}&type=<type>`.
The page reads those parameters and **does nothing else until a click**.

```
load      → read token_hash and type into variables, clean the URL, render the button
click     → supabase.auth.verifyOtp({ token_hash, type })
success   → redirect to the resolved next destination
failure   → readable message, link back to /login
```

### Rules

1. **No exchange outside the click handler.** No timer, no `DOMContentLoaded`
   exchange, no auto-submitting form. A scanner that fetches the page gets inert
   HTML. This is the entire point of the page.
2. **`type` is read from the URL, never hardcoded.** Because `signInWithOtp`
   creates users, a new address receives the "Confirm signup" template
   (`type=signup`) and an existing one receives "Magic Link"
   (`type=magiclink`). Recovery sends `type=recovery`. Hardcoding any of them
   breaks the others. Values are checked against an allowlist.
3. **The URL is cleaned on load, not after exchanging.** `history.replaceState`
   runs immediately, so the token is out of the address bar and history before
   the user spends time reading the page.
4. **`next` is an allowlisted key, not a URL.** A raw URL parameter would be an
   open redirect, and `javascript:` in it would exfiltrate the session from
   `localStorage`.
5. **An already-signed-in visitor is not re-exchanged.** Reloading after a
   successful confirmation would hit `otp_expired` on a token that already did
   its job. Check for a session first and move on.

### `verifyOtp` shape

`VerifyTokenHashParams` takes exactly `{ token_hash, type }`. It accepts no
`email` and no `options`. On success it persists the session itself, so no
`setSession` call is needed.

## 4. A2 — password sign-in

### `/login`

Email plus password becomes the default form. "Email me a sign-in link instead"
sits next to it and keeps working exactly as it does today.

**One generic error, always.** Supabase cannot distinguish a wrong password from
an account that has no password from an address that does not exist, and says so
in its own documentation. Any attempt to branch the UI on that would leak account
state. So: one message, plus a permanently visible note pointing at the link
route for anyone who has not set a password yet.

### Setting a password

Offered after signing in, from `/dashboard/profile`, via
`updateUser({ password })` on the already-open session. This works on a magic
link session and needs no current password.

Two things are mandatory here:

1. **A separate `<form>` element.** The existing profile form serialises itself
   with `FormData`, so a password field inside it would be posted to a Netlify
   Function and land in its logs.
2. **`signOut({ scope: 'others' })` right after success.** Without it, someone
   who finds an abandoned session on a shared computer can set a password and
   convert temporary access into permanent account takeover.

### Supabase settings that must stay off

"Require current password when changing password" would make it impossible for a
magic-link user to create their first password, since they have none to supply.
Same for the recovery flow. Leave it disabled while both methods coexist.

## 5. A3 — recovery

`resetPasswordForEmail` with the Reset Password template rewritten to point at
`/login/confirm?token_hash=...&type=recovery&next=set-password`. The same page
handles it with no changes: `verifyOtp` with `type=recovery` opens a session and
emits `PASSWORD_RECOVERY`, then `next` lands the user on the password form.

The recovery email is a single-use link too, so without A1 it would break for the
same people, in the same way.

## 6. Supabase configuration

Applied outside the repo, in the project dashboard. Recorded here because the
panel is not under version control.

| Setting | Value | Why |
|---|---|---|
| Email Templates → Magic Link | link to `/login/confirm` with `{{ .TokenHash }}` | A1 |
| Email Templates → Confirm signup | same | new users get this template, not Magic Link |
| Email Templates → Reset Password | same, `type=recovery` | A3 |
| Redirect URLs | add `<origin>/login/confirm` per origin | otherwise Supabase drops the destination |
| Require current password | **off** | would block first password creation |
| Email OTP expiration | 900 s | shrinks the window the token is exposed |

## 7. Security requirements

From the security review, all mandatory:

- `designer-plan-site/_headers` with `X-Frame-Options: DENY`. Without it the
  confirmation click can be stolen through an invisible iframe, which defeats A1
  entirely. Plus `no-store` on `/login/*` so the token page is not recoverable
  from cache with the back button.
- Allowlist for `next` and for `type`.
- `history.replaceState` on load.
- `signOut({ scope: 'others' })` after a password change.
- Password field in its own form element.

Explicitly **not** required, and deliberately not added: honeypot and
`consent_text` on the login forms. Those repo rules cover forms that write to
`leads` through a Netlify Function. Login does neither: it talks to Supabase
directly from the browser, and signing in is not marketing consent.

## 8. What this does not change

- The dashboard stays open to anonymous visitors. It switches views, it does not
  gate. That was a deliberate decision in commit `e07c03a`.
- No database migration. Passwords live in `auth.users`, managed by Supabase.
- No change to `account-bootstrap`, `partner-apply`, or any other function.
- No visual redesign. New pages reuse `_shared/_partials.css` and the existing
  markup patterns.

## 9. Residual risk, accepted

A scanner that executes JavaScript and clicks buttons would still burn the token.
Defender does not do that, and Supabase documents this page as the mitigation,
but neither Supabase nor we can promise immunity. The password route added in A2
is the fallback for anyone that affects.

If it ever shows up in practice, the next step is documented: add
`{{ .Token }}` to the templates and a 6-digit code field on the confirmation
page. A code can be read by a scanner but not spent by one. Not built now
because it is a second UI for a problem we have no evidence of.
