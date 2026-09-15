# Front-end → BFF Integration Kit — `thedesignerplan.com` checkout

**For:** Doug (storefront HTML) · **Target:** `designer-plan-site/`
**Status:** prepared 2026-06-02 while waiting for Doug's HTML. Grounded against real code on the `adrian-api-bridge` branch:
- `designer-plan-site/netlify/functions/cart-checkout.js` (the live BFF)
- `designer-plan-site/netlify/functions/public-config.js`
- `designer-plan-site/docs/bff-error-contract.md`
- `Designers/src/main/java/com/raptns/designers/dtos/CheckoutResponseDto.java` + `CheckoutRequestDto.java`
- `designer-plan-site/_local-checkout-test.html` (existing local proof-of-loop harness)
- `designer-plan-site/js/cart.js` (existing cart conventions, `dp_cart_v1`)

---

## ⚠ Blocking gaps to close before this works — read first

1. **Stripe publishable key — code done, ops step remaining.**
   `public-config.js` now returns `stripePublishableKey` when the env var is set (the snippet reads it from there). **Remaining:** set `STRIPE_PUBLISHABLE_KEY=pk_live_…` in the Netlify env for `designer-plan-site`. Until that env var is set, the function omits the field and checkout can't mount Stripe. Publishable keys are client-side by design — safe to expose (same posture as `SUPABASE_ANON_KEY`); the SECRET key stays on the engine.

2. **The real BFF + bridge live on the `adrian-api-bridge` branch, not `main`.**
   On `main`, `cart-checkout.js` is still the old `{ checkout_url: null }` stub and `js/cart.js` posts the old `{ items, partner_id }` shape. The bridge must be merged to `main` before deploy.

3. **Stripe API used:** the engine DTO Javadoc documents the modern **Payment Element** (`stripe.confirmPayment`); the local harness uses the legacy **Card Element** (`stripe.confirmCardPayment`). Both finalize the same `client_secret`. Part B below uses the **Payment Element**; the Card Element variant is noted inline.

---

## PART A — Front-end → BFF Integration Contract

### Endpoint

```
POST /.netlify/functions/cart-checkout
Content-Type: application/json
```

The browser **only ever talks to this BFF** — never to Stripe's REST API or the engine directly. The BFF HMAC-signs the request and forwards to the Spring Boot engine `POST /api/v1/checkout`, then passes the engine's `CheckoutResponse` back verbatim.

### Request JSON (browser → BFF)

| Field | Required | Type | Rule / notes |
|---|---|---|---|
| `plan_id` | **required** | integer | Positive integer (`>= 1`). Which of the 3 plans → fulfillment. |
| `sales_order_number` | **required** | string | Non-empty after trim. Customer's furniture order # → warranty linkage. |
| `amount_cents` | **required** | integer | `>= 50`. The page-computed final charge (flat-% of retail). Engine charges as-is. |
| `coverage_retail_cents` | optional | integer | If sent, non-negative. Total retail covered. For the engine's tamper cross-check/audit — **never** the commission base. |
| `customer` | **required** | object | — |
| `customer.name` | **required** | string | Non-empty, `<= 200` chars. |
| `customer.email` | **required** | string | Matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`. BFF lowercases it. |
| `customer.phone` | optional | string | Forwarded if present. |
| `referral_code` | optional | string | Designer attribution → commission split. |
| `items_covered` | optional | string | CRM metadata only — **NOT** forwarded to the engine (stays in `lead_events`). |
| `consent_text` | optional | string | The literal consent copy shown to the user. Written to `leads` (`consent_at` + `consent_text`). **Send it.** |
| `hp` | optional | string | **Honeypot.** Must be empty. If truthy, BFF short-circuits (see below). |

### Success (200) response + required action

Engine's `CheckoutResponseDto`, passed through verbatim (snake_case, `NON_NULL` so absent fields are omitted):

```jsonc
{
  "payment_intent_id": "pi_3Tc...",            // informational
  "client_secret": "pi_3Tc..._secret_...",     // ← THE ONE THAT MATTERS
  "amount_cents": 24900,                         // informational (engine-authoritative)
  "currency": "usd",                             // informational
  "commission_cents": 2490,                      // optional; present only when designer-attributed
  "designer_attributed": true                    // informational
}
```

**Action on success:**
1. Confirm `res.ok === true` **and** `data.client_secret` is present.
2. Init Stripe.js with the **LIVE publishable key** (source: `stripePublishableKey` from `/.netlify/functions/public-config` — see blocking gap #1).
3. Confirm inline via the **Payment Element**: `stripe.confirmPayment({ clientSecret, elements, confirmParams: { return_url } })`.

All side effects (warranty/plan issuance, SOAR write, commission transfer, confirmation email) happen server-side on the engine's `payment_intent.succeeded` webhook.

### Honeypot / 200 edge case — DO NOT START A PAYMENT

If `hp` is truthy, the BFF returns **HTTP 200** with `{ "ok": true, "honeypot": true }` and never calls the engine. **A 200 that lacks `client_secret` must never mount Stripe or call `confirmPayment`.** Always gate on `res.ok && data.client_secret`.

### FULL error catalog

Every non-2xx is `{ "code": "<machine_code>", "message": "<human_text>" }` (engine errors may add a `detail` field). The code set is **open** — switch on `code` when known, fall back to `message`.

**A. BFF-originated (never reaches the engine)**

| HTTP | `code` | What happened | Show the user |
|---|---|---|---|
| 405 | `method_not_allowed` | Request wasn't POST | Shouldn't happen from UI — log it. |
| 400 | `bad_json` | Body wasn't valid JSON | "Something went wrong. Please refresh and try again." |
| 400 | `validation_failed` | Local pre-check; `message` names the field | Show field-specific `message` inline. |
| 502 | `upstream_unavailable` | BFF couldn't reach the engine | "Payment service is temporarily unreachable. Please try again." (retryable) |

**B. Engine pass-through (`ApiV1ExceptionHandler`; status + body unchanged)**

| HTTP | `code` | What happened | Show the user |
|---|---|---|---|
| 400 | `validation_failed` | Engine validation (authoritative); `detail` names the field | Show inline. |
| 400 | `bad_json` | Engine couldn't parse the body | "Something went wrong. Please refresh." |
| 415 | `unsupported_media_type` | `Content-Type` ≠ `application/json` | Config bug — log it. |
| 422 | `business_rule_violation` | A business rule rejected it | Show `message`. |
| 404 | `not_found` | Referenced resource missing | Show `message`. |
| 409 | `conflict` | State conflict | Show `message`. |
| 429 | `rate_limited` | Too many requests | "Too many attempts — please wait a moment." (retryable) |
| 502 | `stripe_unavailable` | Stripe call failed inside the engine | "Payment service is temporarily unreachable. Please try again." (retryable) |
| 500 | `internal_error` | Unhandled engine exception | "Something went wrong on our end. Please try again." (retryable) |

**C. HMAC auth (`401`, from `HmacAuthFilter`) — operational/config bug, never a customer error**

A `401` means the **BFF's own HMAC credentials are misconfigured** (`HMAC_KEY_ID`/`HMAC_SECRET`/clock skew). Codes: `missing_signature_headers`, `unknown_key_id`, `timestamp_skew`, `bad_timestamp`, `invalid_signature`. **UI:** treat like `upstream_unavailable` and **alert ops**.

### Required front-end safety behaviors (non-negotiable — real money)

1. **Disable the submit button on click and keep it disabled until the response resolves**, plus an in-flight boolean guard. Prevents duplicate **real** charges. (See the engine-side note below — this is currently the *only* layer guarding against double charges.)
2. **Include the hidden honeypot field `hp`** and send it.
3. **Send `consent_text`** — the literal consent copy shown.
4. **NEVER call Stripe when a 200 lacks `client_secret`.**

> **⚠ Engine-side caveat (as of 2026-06-02):** the engine's `/api/v1/checkout` does **not** yet pass a Stripe idempotency key, so the front-end single-flight guard (rule #1) is the only thing preventing a double charge today. Closing the engine gap (idempotency key keyed on `sales_order_number`+`plan_id`) is tracked separately — until then, rule #1 is load-bearing.

---

## PART B — Reference checkout snippet (vanilla HTML + JS)

Plain static HTML/JS matching the site's no-framework convention. Stripe.js v3 Payment Element. Styling/copy left for Doug — the JS only depends on the element IDs marked at the top.

```html
<!-- =========================================================================
     designer-plan checkout — reference wiring for the BFF.
     Vanilla, no framework. Stripe.js v3 Payment Element + confirmPayment.

     Element IDs the JS below REQUIRES (keep these ids; restyle freely):
       #dp-checkout-form        the <form> (phase 1: collects details)
       #dp-sales-order          sales_order_number input
       #dp-name                 customer.name input
       #dp-email                customer.email input
       #dp-phone                customer.phone input (optional)
       #dp-hp                   honeypot input (hidden, must stay empty)
       #dp-consent              consent checkbox
       #dp-consent-text         element whose textContent is the literal consent copy
       #dp-payment-element      container the Payment Element mounts into (revealed after phase 1)
       #dp-continue             phase-1 submit button ("Continue to payment")
       #dp-pay                  phase-2 button ("Pay") — confirms the card; hidden until phase 1 succeeds
       #dp-error                error message container
       #dp-amount-display       (optional) shows the cart total to the user

     TWO-PHASE FLOW (required so the user can actually enter a card):
       Phase 1 — user fills details + consent, clicks "Continue to payment":
                 POST to the BFF, get client_secret, then mount + reveal the
                 Payment Element. NO charge happens yet.
       Phase 2 — user enters the card, clicks "Pay": confirmPayment() runs.
       Mounting and confirming in the SAME click is WRONG — the user would never
       get to type a card. The proven _local-checkout-test.html is also two-phase.
     ========================================================================= -->

<script src="https://js.stripe.com/v3/"></script>

<!-- TODO: Doug's markup/styling here. Replace this <form> with the real
     slide-out / page markup, but PRESERVE the element ids listed above. -->
<form id="dp-checkout-form" novalidate>
  <p id="dp-amount-display"><!-- JS fills: e.g. "Total: $249.00" --></p>

  <label for="dp-sales-order">Furniture sales order #</label>
  <input id="dp-sales-order" name="sales_order_number" type="text" required>

  <label for="dp-name">Full name</label>
  <input id="dp-name" name="name" type="text" maxlength="200" required>

  <label for="dp-email">Email</label>
  <input id="dp-email" name="email" type="email" required>

  <label for="dp-phone">Phone (optional)</label>
  <input id="dp-phone" name="phone" type="tel">

  <!-- Honeypot: hidden from humans, must stay EMPTY. Do NOT remove. -->
  <input id="dp-hp" name="hp" type="text" tabindex="-1" autocomplete="off"
         aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;">

  <label>
    <input id="dp-consent" type="checkbox" required>
    <span id="dp-consent-text"><!-- TODO: Doug's exact consent copy here.
      This element's textContent is sent verbatim as consent_text. --></span>
  </label>

  <!-- Phase 1 submit: creates the PaymentIntent via the BFF. -->
  <button id="dp-continue" type="submit">Continue to payment</button>

  <!-- Payment Element + Pay button: revealed only after phase 1 succeeds. -->
  <div id="dp-payment-element" hidden></div>
  <button id="dp-pay" type="button" hidden>Pay</button>

  <p id="dp-error" role="alert" hidden></p>
</form>

<script>
(function () {
  'use strict';

  var BFF_URL    = '/.netlify/functions/cart-checkout';
  var CONFIG_URL = '/.netlify/functions/public-config';
  var CART_KEY   = 'dp_cart_v1'; // same key js/cart.js writes

  var $ = function (id) { return document.getElementById(id); }

  // ---- Single-flight guard: the core double-charge protection. -----------
  var inFlight = false;

  // ---- Stripe handles. `stripe` is created on page load; `elements` +
  //      `clientSecret` are set in phase 1 (after the BFF returns the secret).
  var stripe = null, elements = null, clientSecret = null;

  // ---- Read cart from localStorage (dp_cart_v1) --------------------------
  // TODO(Doug): confirm how the storefront maps a cart line to plan_id +
  // amount_cents. This reference sums price_cents and uses the first line's
  // plan as plan_id. Adjust to the real plan->id mapping for your markup.
  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }
  function cartAmountCents() {
    return readCart().reduce(function (s, it) { return s + (it.price_cents || 0); }, 0);
  }
  function cartPlanId() {
    var items = readCart();
    // plan_id MUST be a positive integer the engine recognizes.
    return items.length ? parseInt(items[0].plan, 10) : NaN;
  }

  // ---- Fetch the Stripe publishable key from public-config (once). -------
  async function getPublishableKey() {
    var res = await fetch(CONFIG_URL);
    var cfg = await res.json().catch(function () { return {}; });
    if (cfg.stripePublishableKey) return cfg.stripePublishableKey;
    // Fallback only for environments where public-config doesn't serve it yet.
    if (window.STRIPE_PUBLISHABLE_KEY) return window.STRIPE_PUBLISHABLE_KEY;
    throw new Error('No Stripe publishable key available');
  }

  function showError(msg) { var el = $('dp-error'); el.textContent = msg; el.hidden = false; }
  function clearError()   { var el = $('dp-error'); el.hidden = true; el.textContent = ''; }

  // ---- Page load: show total + create the Stripe instance once. ----------
  (function init() {
    var disp = $('dp-amount-display');
    if (disp) disp.textContent = 'Total: $' + (cartAmountCents() / 100).toFixed(2);
    getPublishableKey()
      .then(function (pk) { stripe = Stripe(pk); })
      .catch(function () { showError('Payment is temporarily unavailable. Please try again later.'); });
  })();

  // ===== PHASE 1: create the PaymentIntent, then reveal the card field. =====
  $('dp-checkout-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    if (inFlight || clientSecret) return;          // never re-create the PI
    clearError();
    if (!$('dp-consent').checked) { showError('Please accept the terms to continue.'); return; }
    if (!stripe) { showError('Payment is still loading — please try again in a moment.'); return; }

    var payload = {
      plan_id: cartPlanId(),
      sales_order_number: $('dp-sales-order').value.trim(),
      amount_cents: cartAmountCents(),
      customer: {
        name:  $('dp-name').value.trim(),
        email: $('dp-email').value.trim(),
        phone: $('dp-phone').value.trim() || undefined
      },
      consent_text: ($('dp-consent-text').textContent || '').trim(), // Safety rule #3
      hp: $('dp-hp').value                                            // Safety rule #2
    };
    // TODO(Doug): if a designer referral applies, set payload.referral_code.

    inFlight = true;
    $('dp-continue').disabled = true;
    try {
      var res  = await fetch(BFF_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      var data = await res.json().catch(function () { return {}; });

      // Honeypot / no-op 200: NEVER start a payment. (Safety rule #4)
      if (res.ok && !data.client_secret) { inFlight = false; return; }

      if (res.ok && data.client_secret) {
        // Reveal the card field so the user enters the card BEFORE confirm (phase 2).
        clientSecret = data.client_secret;
        elements = stripe.elements({ clientSecret: clientSecret });
        elements.create('payment').mount('#dp-payment-element');
        $('dp-payment-element').hidden = false;
        $('dp-pay').hidden = false;
        $('dp-continue').hidden = true;            // phase 1 complete
        inFlight = false;
        return;
      }

      // Error path: map the {code} contract to a message (open set → fallback).
      showError(messageForError(res.status, data));
      inFlight = false;
      $('dp-continue').disabled = false;           // recoverable: allow retry
    } catch (err) {
      showError('Network error. Please try again.');
      inFlight = false;
      $('dp-continue').disabled = false;
    }
  });

  // ===== PHASE 2: user entered the card → confirm the payment. =====
  $('dp-pay').addEventListener('click', async function () {
    if (inFlight || !clientSecret || !stripe) return;   // Safety rule #1: single-flight
    clearError();
    inFlight = true;
    $('dp-pay').disabled = true;
    var result = await stripe.confirmPayment({
      elements: elements,
      clientSecret: clientSecret,
      confirmParams: {
        // TODO(Doug): real post-payment URL on thedesignerplan.com.
        return_url: window.location.origin + '/checkout/complete'
      }
    });
    // confirmPayment redirects to return_url on success; we only reach here on error.
    if (result.error) {
      showError(result.error.message || 'Your payment could not be completed.');
      inFlight = false;
      $('dp-pay').disabled = false;                // let the user fix the card and retry
    }
    // Legacy alt proven in _local-checkout-test.html (Card Element):
    //   stripe.confirmCardPayment(clientSecret, { payment_method: { card: cardElement, billing_details } })
  });

  // Maps the BFF/engine error contract to a user-facing message.
  function messageForError(status, data) {
    switch (data && data.code) {
      case 'validation_failed':      return (data && data.message) || 'Please check your details and try again.';
      case 'rate_limited':           return 'Too many attempts — please wait a moment.';
      case 'upstream_unavailable':
      case 'stripe_unavailable':     return 'Payment service is temporarily unreachable. Please try again.';
      case 'internal_error':         return 'Something went wrong on our end. Please try again.';
      case 'bad_json':
      case 'unsupported_media_type': return 'Something went wrong. Please refresh and try again.';
      default:
        if (status === 401 || status === 502) return 'Payment service is temporarily unreachable. Please try again.';
        return (data && data.message) || 'Something went wrong. Please try again.';
    }
  }
})();
</script>
```

### Where Doug plugs in

- `<!-- TODO: Doug's markup/styling here -->` — replace the `<form>` body with real markup; **keep the element IDs** (incl. the separate `#dp-continue` and `#dp-pay` buttons — the two-phase flow depends on them).
- `#dp-consent-text` — drop the exact legal consent copy; its `textContent` is sent verbatim as `consent_text`.
- `cartPlanId()` / `cartAmountCents()` — wire the real plan → `plan_id` mapping and the real total (`plan_id` positive int, `amount_cents >= 50`).
- `referral_code` — set from the storefront's designer-attribution mechanism if present.
- `return_url` — the real post-payment landing URL.
- `getPublishableKey()` fallback (`window.STRIPE_PUBLISHABLE_KEY`) — `public-config.js` now serves `stripePublishableKey`, so the fallback is only for envs where the Netlify var isn't set yet; can be removed once it's configured everywhere.
