# Storefront checkout plan: from "Send link" to a paid, attributed plan

Status: plan only, nothing built. Written 2026-10-01 and reviewed the same day
by Codex against both repos (its finding about the legacy checkout was
checked and rejected, see 2.1), after guided testing in
production showed that the client link works up to the shop and stops there.
Evidence was gathered from both repos the same day (file:line references
below are to `RAPMarketingAgency` unless they name `Designers`, the engine at
`C:\SourceCode\RAP\Designers`, branch `master`, version 0.7.6).

Read with: `dashboard-data-contract.md` (section F, the client pipeline),
`frontend-integration-kit.md` (proposed page code), `phase-2-followups.md`,
the engine's `CheckoutApiV1Controller`, `PlanFulfillmentService`,
`StripeWebhookController`.

---

## 1. The chain today, and where it breaks

| Step | Today |
|---|---|
| Designer sends the link from the dashboard | Works. The client gets `https://thedesignerplan.com/plans?ref=AB-RPFG` |
| Client opens `/plans` | Works, but nothing reads `?ref=` (no query parsing anywhere on `/plans` or in `js/cart.js`) |
| Client picks a plan | Three tiers with placeholder prices ("From $[XX]"; buttons carry `data-price-cents` 14900, 24900, 34900 and text slugs `tier-one/two/three`, `plans/index.html` ~1348, ~1413, ~1474). No real plan ids |
| Client pays | Impossible. The button starts `disabled` and `js/cart.js` (~61) enables it once the cart has items, but on click it posts an old stub payload (~173) that `cart-checkout.js` rejects with 400, and the shopper sees "Checkout is in development" |
| Engine charges and attributes | The engine path exists and was validated in Stripe test mode on 2026-05-29, but see section 2 |
| Plan registered, designer credited | The plan registers; the designer is credited only if they have connected Stripe (section 2.2) |

What the real checkout needs from the shopper and the page does not collect
at all (there is no form on `/plans`): customer name and email (required),
phone, a sales order number (required), the furniture value if the price
depends on it, consent text and the honeypot field required by `CLAUDE.md`.

---

## 2. Risks that exist in production right now

### 2.1 A plan can be bought for 50 cents (live keys)

Verified 2026-10-01:

- The engine runs `checkout.pricing-mode=amount` in production
  (`application-prod.properties:97`): it charges the `amount_cents` the
  browser sends. The only floor is `checkout.amount-min-cents=50`.
- `pricing.tampering.mode` is `soft` (base `:118`, prod line commented out),
  and the cross-check does nothing when `coverage_retail_cents` is omitted
  (`CheckoutApiV1Controller.java` ~332).
- `checkout.allowed-plan-ids` is set in no profile, so fulfillment accepts any
  plan id that resolves (`PlanFulfillmentService.java:400`).
- `/.netlify/functions/cart-checkout` is public by design (shoppers are
  anonymous) and validates shape only; it answers in production today.

So a request built by hand can create a live PaymentIntent for plan 500000 at
$0.50. Paying it needs the client secret, which the response carries, and the
account's publishable key, which is public by nature (any Stripe page of the
account shows it). Fulfillment then registers a real Premium Plus plan.

Likelihood is low (someone has to find the endpoint and the payload), the
cost is real, and the fix is cheap: see Phase 0. Source inspection shows the
configuration; whether plan 500000 resolves in the production database was
not checked.

The legacy designerplan.io checkout (`CheckoutController`
`/create-payment-intent`) also creates PaymentIntents without a login, but
it recomputes the total on the server from each plan's retail price
("Defense in depth (F-01)" in that method), so it does not share this
problem. It is designerplan.io's working store and is not closed by this
plan.

### 2.2 A designer without Stripe loses the sale silently

`lookupReferralDesigner` returns no designer when the dealer has no Stripe
account (`Designers` `CheckoutApiV1Controller.java:369-373`). The sale then
goes to the house dealer `checkout.default-dealer-id=416`, without
`affiliated_id`, and fulfillment creates commission rows only when
`transfer_enabled=true` (`PlanFulfillmentService.java:126,172`). Tests assert
this fallback (`referralCode_designerWithoutStripe_fallsBackToDirect`).

Every new designer starts without Stripe, and dealer 421 is in that state
today: every sale through its link would be credited to dealer 416. The
deferred-payout machinery exists (`CommissionService.java:106-107` writes
`PENDING_STRIPE_ONBOARD`, `StripeConnectController.java:245-321` pays those
rows later), but nothing in the v1 path feeds it, and it only runs from the
session-bound `GET /stripe/onboard/return`.

### 2.3 A paid plan can fail to register

If fulfillment rejects the plan id after the charge (unknown or not allowed),
the webhook returns 500, Stripe retries for about three days and gives up:
the customer is charged and nothing is registered
(`PlanFulfillmentService.java:137-141`). Nothing reconciles or refunds such a
payment afterwards.

### 2.4 Refunds change nothing

No handler exists for `charge.refunded` or disputes. A refunded plan stays
Paid and active, and the designer keeps the commission.

---

## 3. Decisions only the business can take

Each has a recommendation; none of the work below can be finished without them.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Do designers without Stripe earn commission on sales made before they connect it? | Yes. Accrue as `PENDING_STRIPE_ONBOARD` and pay when Stripe is ready. Otherwise the client link is useless for every new designer |
| D2 | How is the price set: fixed per tier, or a percentage of the furniture value? What are the numbers, minimum and maximum? | Whatever it is, the engine computes it. The page shows it but is never trusted |
| D3 | What does a shopper without a store order number enter? | A reference the shop creates for that purchase (S2), shown on the receipt; a store order number is optional |
| D4 | Which plan ids are sold (300000 Stains, 400000 Premium, 500000 Premium Plus; is 600000 in)? | Confirm the three and lock them in an allowlist |
| D5 | One plan per payment, or a multi-plan cart? | One plan per payment for launch. The engine charges one plan per PaymentIntent |
| D6 | Commission rate shown to designers. The cart banner says 35% (`js/auth.js` ~192), the engine pays a flat 10% (`checkout.commission.percent=10`) | Fix the number before any designer sees the banner with real sales |
| D7 | Refund policy: does the plan cancel, does the commission come back, full or prorated? | Cancel the plan, reverse or cancel the commission in full, alert RAP |
| D8 | How long does a `?ref=` last, first touch or last touch, and can a hand-typed code override it? | 30 days, last touch, editable field prefilled |
| D9 | Consent wording shown at checkout | Legal wording from RAP |
| D10 | Does a plan activate on payment, or after review? | Sets the success page copy; on payment matches what fulfillment does today |

---

## 4. The plan

### Phase 0: close the live exposure now (small, can ship this week)

**P0.1 Checkout switch in the BFF.** `cart-checkout.js` answers
`503 { code: "checkout_closed" }` unless the Netlify env var
`CHECKOUT_OPEN=true` is set. It is not set today, so the endpoint closes the
moment this deploys, and nothing on the site can use it anyway. Unit test for
both states. This is reversible with one env var.

**P0.2 Allowlist in production.** Set `checkout.allowed-plan-ids` to the
confirmed ids (D4) in the engine's prod profile, so an unknown plan cannot be
registered even through an old link.

Phase 0 does not need any business decision except D4, and P0.1 not even that.

The switch is enough for the browser-priced path: `/api/v1/checkout` only
accepts HMAC-signed calls, and `cart-checkout.js` is the only holder of the
key. The allowlist stops registration of an unknown plan, not the charge;
the check before the charge is E3.

### Phase 1: engine (blockers before taking real money)

**E1 Credit designers without Stripe (D1).** Return the designer from the
lookup even without a Stripe account; put `dealer_id`, the stored
`affiliated_id` (follow-up 27), the commission amount and a "deferred" flag in
the metadata; have fulfillment create the commission with an empty account so
it lands as `PENDING_STRIPE_ONBOARD`. Rewrite the tests that assert the
fallback. Keep the transfer split for designers whose Stripe is ready, and
require "ready" (charges and payouts enabled), not just a non-blank id, so a
restricted account does not make the PaymentIntent fail.

**E2 Server-side price (D2).** The page sends the plan id (and the furniture
value if D2 says so); the engine computes the amount. `price-band` mode
already does this through `CommissionService.resolvePlanRetail`
(`CheckoutApiV1Controller.java:151-168`); its fallback of 10% of the cart when
a band has no retail price (`CommissionService.java:61-66`) must become a
refusal. `amount_cents` from the browser stops being charged; it can stay as a
display cross-check.

**E3 Check the plan before the charge (D4).** At checkout, reject a plan id
that does not resolve or is not in the allowlist, and make an empty allowlist
in the prod profile a startup error. The check that exists at fulfillment
stays as the second line.

**E4 Refunds and disputes (D7).** Handle `charge.refunded` and
`charge.dispute.created`: mark the sale cancelled, cancel or reverse the
commission, alert RAP.

**E5 Pay deferred commissions without a session.** Run the existing
`processPendingCommissions` from the `account.updated` webhook when the
account becomes ready, not only from the session-bound onboarding return.
`account.updated` has the same deserialization problem as the events in E6.
Today that method marks a row PROCESSING before the transfer is created, so
a crash in between strands the row outside every later query: make the
transition recoverable (transfer with an idempotency key first, then the
status, or a sweep for rows stuck in PROCESSING).

**E8 Reconcile what was paid with what was registered.** A daily job (or a
dashboard query to start) that lists succeeded PaymentIntents with
`fulfillment=v1` and no `SoarSales` row, and commissions whose sale was
refunded. Paid but never registered is either fixed and replayed or refunded,
by a person, within days, not discovered by the customer.

**E6 Webhook hygiene.** Give `transfer.created` and `payout.*` the same
`deserializeUnsafe` fallback `payment_intent.succeeded` has (they do nothing
today under the pinned API version); move the PROCESSING status update after
fulfillment creates the transaction (attributed rows stay PENDING today);
verify in the prod database that dealer 416 exists with a store and that
`SoarSales.StripePaymentIntentId` has a unique index.

**E7 Sales order number (D3).** Validate length and characters at checkout
(Stripe caps metadata at 500 characters), and accept the designer's client
reference format from S2.

### Phase 2: the shop (`designer-plan-site`)

**S1 Capture the referral.** A small `js/ref.js` on every page: read `?ref=`,
normalise (trim, upper case, `^[A-Z0-9-]{3,32}$`), keep `{ code, ts }` in
localStorage `dp_ref_v1` for D8's lifetime, last touch wins, cleared after a
successful payment. Shown at checkout as an editable "Referral code" field.

**S2 One order reference per purchase, and the client for attribution.**
Two different things, kept apart:

- *Order reference.* When the shopper starts checkout, the shop creates an
  order reference (`DP-` plus a random id) and keeps it with the cart until
  that purchase is paid, then discards it. Every retry of the same purchase
  sends the same reference, so the idempotency key and the
  `already_purchased` guard behave; a later, separate purchase of the same
  plan by the same client gets a new reference and is not blocked. It is the
  sales order number when the shopper has none (D3), and the shop's own
  version of follow-up 23 (the browser attempt id).
- *Client.* The send-link email adds the prospect id:
  `/plans?ref=AB-RPFG&c=<partner_clients.id>`, sent with the checkout as
  metadata for attribution, so the pipeline's "Link sent to Active" is exact
  instead of relying on the email match. Not used as the order reference
  (one client can buy twice) and not used to prefill personal data at
  launch.

Limits that remain and are accepted: the key still changes if the shopper
edits their name or phone between attempts (a second PaymentIntent, not a
second charge unless both are paid), and the guard only sees purchases
whose fulfillment has run. E8 catches what slips through.

**S3 One plan, real ids (D4, D5).** Tier buttons carry `data-plan-id`; the cart
holds one plan; the price comes from the engine (E2) through the BFF and is
shown, never computed on the page.

**S4 Checkout form in the drawer.** Name, email, phone, order number (or the S2
reference), referral code prefilled, consent text (D9), honeypot `hp`.

**S5 Payment.** The two-step flow from `frontend-integration-kit.md` (about 80%
reusable): create the PaymentIntent through `cart-checkout.js`, then mount
the Stripe Payment Element and confirm. Fix the kit's known gaps
(`parseInt("tier-one")` is NaN, `referral_code` is a TODO, its `return_url`
page does not exist). Load Stripe.js and read the publishable key from
`public-config` (`STRIPE_PUBLISHABLE_KEY` is not set in Netlify today).
Handle the idempotent replay: a retry can return a PaymentIntent that is
already paid, so show the outcome instead of starting over. Map
`already_purchased`, `checkout_in_progress`, `checkout_conflict`.

**S6 Result page.** `/checkout/complete/` reads `redirect_status` and
`payment_intent_client_secret`, retrieves the PaymentIntent, shows success or
failure (D10), clears the cart and the stored referral on success.

**S7 Commission banner (D6).** Show the commission the server returns, or
remove the figure.

**S8 BFF.** `cart-checkout.js` accepts the S2 client reference and the plan id,
stops forwarding a browser price as the charge (E2), logs `cart_started` as
today and keeps the Phase 0 switch.

### Phase 3: go live

1. Everything in Stripe test mode: local engine on the dev profile and a Netlify
   deploy preview with test keys, card 4242, plus a refund and a declined card.
2. Designer without Stripe buys through the link: commission appears as
   pending; connect Stripe in test mode: the commission is paid (E1, E5).
3. Tampering checks: a hand-built request with a low amount or an unknown plan
   is refused before any PaymentIntent exists (E2, E3).
4. Production with live keys: one real purchase at the real price by RAP,
   then a refund, checking plan, commission and both dashboards at each step.
5. Turn `CHECKOUT_OPEN=true`, enable the checkout button, and only then tell
   designers that "Send link" sells.

---

## 5. Tests

- Engine: unit and controller tests for E1 to E7 in the style of
  `CheckoutApiV1ControllerTest`; the existing fallback tests change meaning
  and are rewritten, not deleted.
- BFF: `tests/unit/cart-checkout.test.js` for validation, the switch, the S2
  reference and the error mapping.
- Site: `tests/unit/ref.test.js`; Playwright `12-plans-checkout.spec.ts` with a
  routed BFF (arrive with `?ref=`, the code survives navigation, the request
  carries it, honeypot, one plan only, every error code shown), and one run
  against Stripe test mode with the Payment Element.

---

## 6. Order and size

| Order | Item | Size | Waits on |
|---|---|---|---|
| 1 | P0.1 checkout switch | S | nothing |
| 2 | P0.2 allowlist | S | D4 |
| 3 | E3, E7 | S | D3, D4 |
| 4 | E1, E5 | M | D1 |
| 5 | E2 | M | D2 |
| 6 | E4, E6, E8 | M | D7 |
| 7 | S1, S2 | M | D3, D8 |
| 8 | S3 to S8 | L | E2, D5, D6, D9, D10 |
| 9 | Phase 3 | M | everything above |

S1 and S2 can start in parallel with the engine work; S3 onwards needs E2,
because the page shows the engine's price.

## 7. Not in this plan

Multi-plan carts, the receipt upload mentioned in `dashboard-spec.html`, the
care kits on `/plans` (no add-to-cart), the browser attempt id (follow-up 23),
keys on the legacy designerplan.io checkout paths (follow-up 24).
