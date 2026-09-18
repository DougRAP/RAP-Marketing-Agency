# Supabase Auth email templates

These live in the Supabase dashboard, which is not under version control, so
the authoritative copy is here. Authentication → Emails → Templates.

**Without these edits the code in this repo does nothing.** The test suite
mints its own tokens and builds the confirm URL itself, so it passes green
whether or not the dashboard was updated. Changing the templates is the step
that actually ships A1.

## Why they change

The default templates use `{{ .ConfirmationURL }}`, which resolves to
`/auth/v1/verify?token=...` — a GET that spends a single-use token. Corporate
link scanners fetch every link in incoming mail, so the scanner spends it and
the recipient gets "Email link is invalid or has expired".

These templates link to our own page instead, carrying `{{ .TokenHash }}`.
That page redeems nothing until a person clicks.

## Three templates, not one

`signInWithOtp` creates accounts, so which template an address receives
depends on whether it already exists:

| Template | Who gets it | `type` |
|---|---|---|
| Magic Link | an address that already has an account | `magiclink` |
| Confirm signup | a brand-new address | `signup` |
| Reset Password | anyone using "forgot password" | `recovery` |

Editing only Magic Link leaves every new signup broken. The confirm page reads
`type` from the URL for this reason, and never hardcodes it.

---

## Magic Link

```html
<h2>Sign in to Designer Plan</h2>

<p>Tap below to sign in. For your security we will ask you to confirm on the
next screen, so an automatic email scanner cannot use this link before you do.</p>

<p><a href="{{ .SiteURL }}/login/confirm?token_hash={{ .TokenHash }}&type=magiclink">Sign in</a></p>

<p>If you did not ask for this, you can ignore it. The link expires shortly.</p>
```

## Confirm signup

```html
<h2>Welcome to Designer Plan</h2>

<p>Tap below to finish setting up your account. For your security we will ask
you to confirm on the next screen.</p>

<p><a href="{{ .SiteURL }}/login/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm my account</a></p>

<p>If you did not ask for this, you can ignore it. The link expires shortly.</p>
```

## Reset Password

```html
<h2>Choose a new password</h2>

<p>Tap below to set a new password for your Designer Plan account. For your
security we will ask you to confirm on the next screen.</p>

<p><a href="{{ .SiteURL }}/login/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/login/new-password">Reset my password</a></p>

<p>If you did not ask for this, you can ignore it and your password stays as
it is. The link expires shortly.</p>
```

## Client plan link (sent by client-send-link.js through the Resend API)

Unlike the three above, this one is not a Supabase template. It lives in
code (`netlify/functions/client-send-link.js`, `buildMessage`) and goes out
through the Resend HTTP API with `RESEND_API_KEY` from the Netlify env. This
section is the reviewed copy; when the wording changes, change both.

- From: `Designer Plan <no-reply@send.thedesignerplan.com>` (the verified
  sending domain, same as the auth mail)
- Reply-to: the designer's own sign-in email, so a reply reaches the designer
- Subject: `{{designer_name}} sent you your Designer Plan link`

Text body:

```text
Hi {{client_name}},

{{designer_name}} is sending you the link to protect your new furnishings with Designer Plan.

{{link}}

Reply to this email to reach {{designer_name}} directly.
```

HTML twin, one paragraph per line above:

```html
<p>Hi {{client_name}},</p>
<p>{{designer_name}} is sending you the link to protect your new furnishings with Designer Plan.</p>
<p><a href="{{link}}">{{link}}</a></p>
<p>Reply to this email to reach {{designer_name}} directly.</p>
```

Placeholders:

| Placeholder | Value |
|---|---|
| `{{client_name}}` | `partner_clients.client_name` |
| `{{designer_name}}` | `partners.studio_name`, else the engine's `dealer_name`, else the designer's email |
| `{{link}}` | `https://thedesignerplan.com/plans?ref=<affiliated_id>` from the engine (contract A) |

`client_name` and `designer_name` are HTML-escaped in code before they go
into the HTML body; the text body carries them as typed. There is no
unsubscribe link on purpose: a one-off referral a person asked their designer
for is not a marketing list (contract F, "Not doing, on purpose").

---

## Settings that go with them

Authentication → URL Configuration:

- **Site URL** must be `https://thedesignerplan.com`. `{{ .SiteURL }}` in the
  templates above resolves to this, so if it is wrong every link is wrong. A
  fresh Supabase project ships with `http://localhost:3000`, which is exactly
  the failure this project spent months with.
- **Redirect URLs** need `/login/confirm` per origin, alongside the existing
  entries. `https://thedesignerplan.com/**` covers it.

Authentication → Providers → Email:

- **Require current password when changing password: off.** A partner who has
  only ever used the magic link has no current password to supply, so turning
  this on makes it impossible for them to create their first one, and breaks
  recovery too.
- **Email OTP expiration: 900 seconds.** The default hour is a long time for a
  token to sit in an inbox. Fifteen minutes is plenty for someone to open an
  email and click a button.

## Verifying it worked

The only real test is a corporate mailbox, because that is the one that has a
scanner:

1. Request a sign-in link to a Microsoft 365 address.
2. Wait a minute so any scanner has time to fetch it.
3. Then click. If you land on `/login/confirm` and the button signs you in, it
   works. If you get "invalid or expired" before clicking anything, the
   template was not saved.

A Gmail or Mailgun address will succeed either way, so it proves nothing here.
