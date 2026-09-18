# BFF Error Contract — `cart-checkout`

> **Audience:** whoever builds the slide-out front-end (the page that calls
> `/.netlify/functions/cart-checkout`). This catalogs every HTTP status + JSON
> shape the BFF can return, so the UI can map each to a clear user message.
>
> **Scope:** the browser → BFF hop. The BFF itself signs (HMAC) and calls the
> Spring Boot engine `POST /api/v1/checkout`; engine errors are **passed through
> unchanged**, so they appear in this list too (marked *engine pass-through*).
>
> Source of truth: `designer-plan-site/netlify/functions/cart-checkout.js`,
> engine `ApiV1ExceptionHandler.java` + `HmacAuthFilter.java` (Designers repo).
> Keep this doc in sync when any of those change.

---

## Request (browser → BFF)

`POST /.netlify/functions/cart-checkout` · `Content-Type: application/json`

```jsonc
{
  "plan_id": 300000,                 // required, positive int (which plan → fulfillment)
  "sales_order_number": "SO-12345",  // required (customer's furniture order # → warranty)
  "amount_cents": 24900,             // required, int >= 50 (page-computed price)
  "coverage_retail_cents": 500000,   // optional, non-negative int (total retail covered)
  "customer": {
    "name": "Jane Doe",              // required, <= 200 chars
    "email": "jane@example.com",     // required, valid email
    "phone": "555-0100"              // optional
  },
  "referral_code": "DL-7CN0",        // optional, designer attribution → commission
  "items_covered": "Sofa, ottoman",  // optional, CRM metadata (NOT sent to engine)
  "consent_text": "...",             // optional, stored on the lead record
  "hp": ""                           // honeypot — MUST stay empty
}
```

---

## Success — `200 OK`

The engine's `CheckoutResponse`, passed through verbatim:

```jsonc
{
  "payment_intent_id": "pi_3Tc...",
  "client_secret": "pi_3Tc..._secret_...",   // feed to Stripe Elements confirmCardPayment
  "amount_cents": 24900,
  "currency": "usd",
  "commission_cents": 2490,                   // present when designer-attributed
  "designer_attributed": true
}
```

**Honeypot hit** also returns `200` but with a sentinel — do **not** treat as a
real checkout, just show the normal success-ish UI and drop it:

```json
{ "ok": true, "honeypot": true }
```

> The front-end should ignore a `200` that lacks `client_secret` (honeypot or
> malformed) and never attempt to mount Stripe Elements for it.

---

## Errors — `{ code, message }`

Every non-2xx response is `{ "code": "<machine_code>", "message": "<human_text>" }`.
Some engine responses add a third `detail` field (a specific field-level hint) —
safe to surface to developers, not necessarily to end-users.

### A. BFF-originated (never reaches the engine)

| HTTP | `code` | When it fires | Suggested UI message |
|---|---|---|---|
| 405 | `method_not_allowed` | Request was not `POST` | (shouldn't happen from the UI) — log it |
| 400 | `bad_json` | Body is not valid JSON | "Something went wrong. Please refresh and try again." |
| 400 | `validation_failed` | Local pre-check failed; `message` says which field (`plan_id`, `sales_order_number`, `amount_cents`, `customer.name`, `customer.email`, `coverage_retail_cents`) | Show the field-specific `message` inline on that field |
| 502 | `upstream_unavailable` | BFF could not reach the engine (network/timeout) | "Payment service is temporarily unreachable. Please try again." |

### B. Engine pass-through (`/api/v1/checkout` via `ApiV1ExceptionHandler`)

The BFF forwards these with the engine's status + body unchanged.

| HTTP | `code` | When it fires | Suggested UI message |
|---|---|---|---|
| 400 | `validation_failed` | Engine bean/controller validation (authoritative); `detail` names the field | Show inline; the engine is stricter than the BFF |
| 400 | `bad_json` | Engine could not parse the body | "Something went wrong. Please refresh." |
| 415 | `unsupported_media_type` | `Content-Type` ≠ `application/json` | (config bug) — log it |
| 422 | `business_rule_violation` | A business rule rejected the request (e.g. amount-vs-coverage in `strict` tamper mode) | Show `message` |
| 404 | `not_found` | Referenced resource missing | Show `message` |
| 409 | `conflict` | State conflict | Show `message` |
| 429 | `rate_limited` | Too many requests | "Too many attempts — please wait a moment." |
| 502 | `stripe_unavailable` | Stripe API call failed inside the engine | "Payment service is temporarily unreachable. Please try again." |
| 500 | `internal_error` | Unhandled engine exception | "Something went wrong on our end. Please try again." |

> Controllers throw `ResponseStatusException` with a `"code:message"` reason, so
> new codes can appear without a new handler. The front-end should therefore
> **switch on `code` when known, and fall back to showing `message`** for any
> unrecognized code rather than hard-coding the full set.

### C. HMAC auth (`401`, from `HmacAuthFilter`)

These only surface to the browser if the **BFF's own signing is misconfigured**
(wrong/missing `HMAC_KEY_ID` / `HMAC_SECRET`, or clock skew). The browser never
signs — so a `401` here is an **operational/config bug**, not a user error.
Body is always `{ "code": "...", "message": "Authentication failed." }`.

| `code` | Cause |
|---|---|
| `missing_signature_headers` | One of the 3 `X-RAP-*` headers absent |
| `unknown_key_id` | `X-RAP-Key-Id` not in the engine keystore |
| `timestamp_skew` | `X-RAP-Timestamp` outside ±300s |
| `bad_timestamp` | `X-RAP-Timestamp` not ISO-8601 |
| `invalid_signature` | Recomputed HMAC did not match |

UI: treat any `401` as `upstream_unavailable` ("temporarily unreachable") and
**alert ops** — it means the bridge credentials are wrong, not the customer.

---

## Front-end handling cheat-sheet

```js
const res = await fetch('/.netlify/functions/cart-checkout', { method: 'POST', body });
const data = await res.json().catch(() => ({}));

if (res.ok && data.client_secret) {
  // mount Stripe Elements, confirmCardPayment(data.client_secret)
} else if (data.code === 'validation_failed') {
  showFieldError(data.message);          // inline, field-specific
} else if (res.status === 401 || data.code === 'upstream_unavailable'
           || data.code === 'stripe_unavailable' || res.status === 502) {
  showRetry('Payment service is temporarily unreachable. Please try again.');
} else {
  showRetry(data.message || 'Something went wrong. Please try again.');
}
```

**Rules of thumb**
- Always parse the body defensively (`.catch(() => ({}))`).
- Branch on `code` when known; otherwise show `message`; never assume the set is closed.
- `401` / `*_unavailable` = retryable + ops-alert, not a customer-facing data error.
- A `200` without `client_secret` is a honeypot/no-op — do not start payment.
