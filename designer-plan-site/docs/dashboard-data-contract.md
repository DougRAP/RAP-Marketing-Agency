# Dashboard data contract (phase 2)

**Status:** draft for review, 2026-09-18. No code exists against this yet.
**Purpose:** fix the two interfaces of phase 2 before writing either side, so
the engine (Java) and the site (Netlify + browser) can be built in parallel.

Two contracts, one document:

- **A. Engine ↔ BFF.** `POST /api/v1/partner/dashboard`, protected by HMAC.
- **B. Browser ↔ BFF.** `GET /.netlify/functions/dashboard-data`, protected by
  the user's Supabase JWT.

The browser never talks to the engine. Same shape as the checkout bridge.

```
browser ──JWT──► dashboard-data (BFF) ──HMAC──► engine ──► SOAR
```

---

## A. Engine ↔ BFF

### Endpoint

```
POST /api/v1/partner/dashboard
Content-Type: application/json
X-RAP-Signature: <hex hmac-sha256>
X-RAP-Timestamp: <ISO 8601 instant>
X-RAP-Key-Id:    <key id>
```

The three HMAC headers are the existing contract, verified by
`HmacAuthFilter` on everything under `/api/v1/`. Nothing new to design there.

**Why POST with a body rather than GET with the email in the query.** The
filter signs `getRequestURI()` plus `getQueryString()` exactly as they arrive
on the wire. A referral code is plain ASCII and never gets re-encoded; an email
carries `@`, which a client may send as `%40`, and one character of difference
between what was signed and what was sent invalidates the signature. The body
is hashed as bytes and has no such ambiguity. It is also the exact path the
checkout BFF already proves in production.

A `GET /api/v1/partner/{dealerId}/dashboard` variant can be added later, once
the BFF caches the SOAR id in Supabase and no longer needs to look up by email.
Not in this phase.

### Request body

```json
{ "email": "adrian01@rapqa.com" }
```

| Field | Required | Rule |
|---|---|---|
| `email` | yes | non-empty after trim, matches `^[^\s@]+@[^\s@]+\.[^\s@]+$` |

The engine resolves it with `DealerServices.findDealerByAnyEmail`: DealerEmail
first, KC_Email second, and a designer row wins when one email matches several
dealers. That method exists, is tested, and is the reason the lookup fix went
in first.

### Response 200

`snake_case`, via `@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)`
on the DTO, like every other v1 DTO. `@JsonInclude(NON_NULL)` so absent
optionals are omitted rather than `null`.

```json
{
  "dealer_id": 421,
  "affiliated_id": "AB-RPFG",
  "dealer_name": "Adrian Barres",
  "stripe_status": "NOT_CONNECTED",
  "stripe_account_id": null,

  "tracked_cents": 178840,
  "pending_cents": 93600,
  "payable_cents": 0,
  "paid_cents": 85240,
  "total_sales": 5,

  "commissions": [
    {
      "plan_registration_id": 12345,
      "purchase_date": "2026-09-09",
      "customer_last_name": "Estevez",
      "plan_number": "QAFAKE-W005",
      "plan_type": "Plan B",
      "retail_paid_cents": 304000,
      "commission_cents": 30400,
      "commission_status": "Pending",
      "months_coverage": 36,
      "months_remaining": 36,
      "plan_sent": true
    }
  ]
}
```

#### Field by field

| Field | Type | Source in the engine | Notes |
|---|---|---|---|
| `dealer_id` | int | `Dealer.dealerId` | the BFF may cache this later |
| `affiliated_id` | string | `Dealer.affiliatedId` | the referral code |
| `dealer_name` | string | `Dealer.dealerName` | for designers this is the person's name, not a studio; the site keeps its own `studio_name` in Supabase |
| `stripe_status` | enum | `StripeService.getAccountStatus().status()` | `NOT_CONNECTED`, `PENDING`, `RESTRICTED`, `READY`. See degradation below |
| `stripe_account_id` | string or absent | `Dealer.stripeAccountId` | omitted when null |
| `pending_cents` | int | sum of `CommissionAmount` where status in `PENDING`, `PENDING_STRIPE_ONBOARD` | earned but not moving; the designer has to connect Stripe |
| `payable_cents` | int | sum where status in `PROCESSING`, `TRANSFERRED` | moving through Stripe, lands without any action |
| `paid_cents` | int | sum where status is `COMPLETED` | paid out to the bank |
| `tracked_cents` | int | `pending + payable + paid` | excludes `FAILED` and `CANCELLED` |
| `total_sales` | int | count of all commission rows for the dealer | **no status filter**, matches the old dashboard |
| `commissions[]` | array | `findByDesignerDealerIdOrderByCreatedDateDesc`, joined to `SoarSales` by `PlanRegistrationID` | newest first, all rows, no pagination in this phase |

These three buckets are the page's ledger (*Pending commission*, *Payable now*,
*Paid to date*, summing to *Tracked commission*), and they fall straight out of
the status lifecycle: a commission is born `PENDING_STRIPE_ONBOARD` at checkout,
moves to `PROCESSING` then `TRANSFERRED` once Stripe takes it, and ends
`COMPLETED` when the payout lands. The old dashboard lumps the first four into
one "pending"; this splits them because the page has room to say more, and
because "waiting on you" and "on its way" are different messages to a designer.

Commission item:

| Field | Type | Source |
|---|---|---|
| `plan_registration_id` | int | `DesignerCommission.planRegistrationId` |
| `purchase_date` | date, ISO 8601 (`YYYY-MM-DD`) | `SoarSales.planRegistrationDate` |
| `customer_last_name` | string | `SoarSales.custLast` |
| `plan_number` | string | `SoarSales.warrantyNumber` |
| `plan_type` | string | `SoarSales.planType` |
| `retail_paid_cents` | int | `DesignerCommission.totalSaleAmount` |
| `commission_cents` | int | `DesignerCommission.commissionAmount` |
| `commission_status` | enum | mapped from `TransferStatus`, table below |
| `months_coverage` | int | `SoarSales.planTerm` |
| `months_remaining` | int | computed, as the old dashboard already does |
| `plan_sent` | bool | `SoarSales.planRegistrationDocLink` non-empty |

When the `SoarSales` row is missing (should not happen, but the old dashboard
guards for it), the item still appears with `customer_last_name` empty and the
month fields absent. Never drop a commission because its sale is missing: the
money is the record that matters.

#### Money is integer cents

The engine stores amounts as `Double`. They cross this boundary as **integer
cents**, converted with `Math.round(amount * 100)`. A `Double` serialised to
JSON turns into `852.4000000001` in some client sooner or later, and money
should never be a float on the wire. The page formats for display.

#### `commission_status`, the four labels

The database holds seven `TransferStatus` values in UPPERCASE. The response
carries the four labels the old dashboard shows, capitalised, mapped exactly as
`DashboardController` does today:

| `TransferStatus` in the database | `commission_status` |
|---|---|
| `COMPLETED` | `Paid` |
| `FAILED` | `Failed` |
| `CANCELLED` | `Cancelled` |
| anything else, `PENDING` included | `Pending` |

Decision: the API returns the label, not the raw status. The page needs only
the label, and the "anything else is Pending" rule is business logic that
belongs on the server. If raw statuses are ever needed for filtering, add a
`transfer_status` field then; do not change this one.

#### Stripe degrades, it does not fail the response

If `StripeService` throws, the dashboard still returns 200. `stripe_status`
falls back to `READY` when the dealer has an account id and `NOT_CONNECTED`
when it does not, which is exactly what the old dashboard does. A Stripe
hiccup must not blank out a designer's sales.

### Errors

Every non-2xx is `{ "code": "...", "message": "..." }`, through the existing
`ApiV1ExceptionHandler`. Only these can originate here:

| HTTP | `code` | When |
|---|---|---|
| 400 | `validation_failed` | `email` missing or malformed |
| 404 | `not_found` | no designer matches that email. **Also** when a dealer matches but is not a designer (`dealerTypeId != 2`): same code, same message, so the response does not reveal that a store row exists |
| 401 | HMAC codes | unchanged, from the filter |
| 500 | `internal_error` | anything unexpected |

A designer with **no sales** is not an error: 200 with zeros and an empty
`commissions` array.

---

## B. Browser ↔ BFF

### Endpoint

```
GET /.netlify/functions/dashboard-data
Authorization: Bearer <supabase access_token>
```

No query parameters and no body. **The email comes from the token, never from
the request.** Anything else would let a caller ask for someone else's numbers.

### What the function does, in order

1. Reject without `Authorization: Bearer` → 401 `missing_bearer_token`.
2. `supabase.auth.getUser(jwt)` with the service-role key, same as
   `account-bootstrap.js`. Invalid → 401 `invalid_token`.
3. Take `user.email`.
4. `POST` to the engine as in contract A, signed with `_hmac.js`.
5. Engine 200 → pass the body through, adding `"linked": true`.
6. Engine 404 → `200 { "linked": false }`. This is the normal case for
   someone who signed up on the site and does not exist in SOAR yet. It is not
   an error and the page must not treat it as one.
7. Engine unreachable or 5xx → 502 `upstream_unavailable`.
8. Engine 401 → 502 `upstream_unavailable` and a `console.error`, because a
   401 from the engine means the BFF's own HMAC credentials are wrong, which is
   an ops problem, never a user problem.

### Response 200, linked

```json
{
  "linked": true,
  "dealer_id": 421,
  "affiliated_id": "AB-RPFG",
  "dealer_name": "Adrian Barres",
  "stripe_status": "NOT_CONNECTED",
  "tracked_cents": 178840,
  "pending_cents": 93600,
  "payable_cents": 0,
  "paid_cents": 85240,
  "total_sales": 5,
  "commissions": [ ... ]
}
```

Everything after `linked` is the engine's body, untouched.

### Response 200, not linked

```json
{ "linked": false }
```

### Errors

Same `{ code, message }` shape as `cart-checkout.js`, from
`docs/bff-error-contract.md`.

### Environment

`HMAC_KEY_ID`, `HMAC_SECRET`, `ENGINE_BASE_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. All already required by `cart-checkout.js`.

`ENGINE_BASE_URL` is currently set to `http://127.0.0.1:8080` in Netlify,
which in the cloud is the function itself. It must be the engine's public URL
before this can work.

---

## C. What the page does with it

`js/dashboard.js` already fills `data-field` slots from Supabase for the
account fields. Phase 2 extends it to fill the sales fields from this BFF.

| `data-field` | From |
|---|---|
| `commission-tracked` | `tracked_cents` |
| `commission-paid` | `paid_cents` |
| `commission-pending` | `pending_cents` |
| `commission-payable` | `payable_cents` |
| `plans-sold` | `total_sales` |
| `active-plans` | count of `commissions` where `months_remaining > 0` |
| `total-clients` | count of distinct `customer_last_name` |
| `clients-table` | one row per item in `commissions` |
| `clients-summary` | derived from that list |
| `links-sent` | **no source**, see open question 1 |

Three states the page must render:

- **Linked with sales:** the numbers, the table.
- **Linked, no sales:** zeros and a sentence saying no sales yet. Not a bare
  empty table. This is what most designers will see at first.
- **Not linked:** the account fields from Supabase as today, and a sentence
  saying sales will appear here once the account is matched. Not an error.

The "sample data" ribbon and note from 2026-09-16 go away with this.

---

## D. Decisions taken in this document

| # | Decision | Why |
|---|---|---|
| 1 | Email travels in a POST body, not a query string | HMAC signs the raw query; `@` may be re-encoded; body bytes cannot |
| 2 | Money is integer cents | floats on the wire drift |
| 3 | Per row, `commission_status` is the 4-value label, not the raw status; per dealer, the totals come split into pending, payable and paid | the page needs the label per row and the three buckets for its ledger; both mappings are server logic |
| 4 | Stripe failure degrades to a status, never fails the response | a Stripe hiccup must not blank out sales |
| 5 | Not-a-designer returns the same 404 as not-found | does not reveal that a store row exists for that email |
| 6 | No pagination, newest first | a designer has dozens of sales, not thousands; revisit if that changes |
| 7 | "Not linked" is 200 with `linked:false`, not an error | it is the normal state for a new signup |
| 8 | No caching of `dealer_id` in this phase | works without it, one extra lookup per load; needs a migration with grants when added |

## E. Open questions, to settle before code

1. **`links-sent`.** SOAR does not count links. Either the tile is removed
   from `/dashboard/overview`, or it is computed from something in Supabase.
   Recommendation: remove it in B3. Nothing feeds it.
2. ~~`commission-payable` vs `commission-pending`.~~ Settled 2026-09-18: the
   engine returns three buckets derived from the status lifecycle (see the
   totals table). No open question left here.
3. **`ENGINE_BASE_URL`.** Needs the engine's public URL in Netlify. This is
   ops, not code, and blocks B2's integration test.
4. **Which account demonstrates it to Doug.** He is not a designer in SOAR, so
   his own dashboard will read `linked:false`. The dealer 421 test account is
   what shows numbers.
