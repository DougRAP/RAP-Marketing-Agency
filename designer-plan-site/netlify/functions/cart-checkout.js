// /.netlify/functions/cart-checkout
//
// BFF for the slide-out checkout. Takes a plan-purchase intent from the
// browser, signs it via HMAC, forwards to the Spring Boot engine's
// POST /api/v1/checkout, and returns the Stripe client_secret so the
// browser can finalize via Stripe Elements.
//
// Wire contract (browser → BFF) — JSON body (amount-based model, 2026-05-23):
//   {
//     plan_id: number,                       // required, int (which of the 3 plans → fulfillment)
//     sales_order_number: string,            // required (customer's furniture order # → warranty)
//     amount_cents: number,                  // required, int >= 50 (page-computed price)
//     coverage_retail_cents?: number,        // optional, total retail being covered
//     customer: {
//       name: string,                        // required
//       email: string,                       // required, valid format
//       phone?: string
//     },
//     referral_code?: string,                // optional designer attribution
//     items_covered?: string,                // optional CRM metadata (not sent to engine)
//     consent_text?: string,                 // optional, for lead record
//     hp?: string                            // honeypot
//   }
//
// The checkout page computes amount_cents (flat-% of retail); the engine charges
// it as-is and computes designer commission server-side. coverage_retail_cents is
// forwarded for the engine's tamper cross-check + audit (never the commission base).
//
// Response (200): the engine's CheckoutResponse, passed through:
//   { payment_intent_id, client_secret, amount_cents, currency,
//     commission_cents?, designer_attributed }
//   Honeypot hit also returns 200 but as { ok: true, honeypot: true } — a 200
//   without client_secret must NOT start a payment.
//
// Errors (non-2xx): always { code, message } (engine errors may add `detail`).
//   BFF-originated:
//     405 method_not_allowed   — non-POST
//     400 bad_json             — body not valid JSON
//     400 validation_failed    — local pre-check (message names the field)
//     502 upstream_unavailable — engine unreachable (network/timeout)
//   Engine pass-through (ApiV1ExceptionHandler, status+body unchanged):
//     400 validation_failed / bad_json · 415 unsupported_media_type
//     422 business_rule_violation · 404 not_found · 409 conflict
//     429 rate_limited · 502 stripe_unavailable · 500 internal_error
//   HMAC 401 (HmacAuthFilter; only if THIS BFF's signing is misconfigured):
//     missing_signature_headers / unknown_key_id / timestamp_skew /
//     bad_timestamp / invalid_signature  → treat as upstream + alert ops.
//   Front-end: switch on `code` when known, else show `message`; the set is
//   open (controllers can add codes). Full catalog: docs/bff-error-contract.md
//
// Required env (Netlify dashboard):
//   HMAC_KEY_ID, HMAC_SECRET, ENGINE_BASE_URL  (for engine call)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY    (for lead_events logging)

const { supabase } = require('./_supabase');
const { callEngine } = require('./_hmac');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'POST only');
  }

  // Parse body
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return errorResponse(400, 'bad_json', 'Request body is not valid JSON.');
  }

  // Honeypot — silently accept and drop
  if (body.hp) {
    return jsonResponse(200, { ok: true, honeypot: true });
  }

  // Local validation. The engine re-validates authoritatively; this just
  // catches obvious garbage early to save a round-trip.
  const validationError = validate(body);
  if (validationError) {
    return errorResponse(400, 'validation_failed', validationError);
  }

  // Build engine payload — strict subset of what the browser sent, in the
  // shape Spring Boot's CheckoutRequestDto expects (amount mode).
  const enginePayload = {
    plan_id: body.plan_id,
    sales_order_number: String(body.sales_order_number).trim(),
    amount_cents: body.amount_cents,
    ...(Number.isInteger(body.coverage_retail_cents)
      ? { coverage_retail_cents: body.coverage_retail_cents }
      : {}),
    customer: {
      name: String(body.customer.name).trim(),
      email: String(body.customer.email).trim().toLowerCase(),
      ...(body.customer.phone ? { phone: String(body.customer.phone).trim() } : {}),
    },
    ...(body.referral_code ? { referral_code: String(body.referral_code).trim() } : {}),
  };

  // Call the engine.
  let engineResp;
  try {
    engineResp = await callEngine('POST', '/api/v1/checkout', enginePayload);
  } catch (err) {
    console.error('[cart-checkout] engine call failed', err.message);
    return errorResponse(
      502,
      'upstream_unavailable',
      'Payment service is temporarily unreachable. Please try again.'
    );
  }

  // Engine returned a 4xx/5xx — pass the body through (it already follows
  // the {code, message} contract). Add console.error for our own logs.
  if (engineResp.status >= 400) {
    const code = engineResp.json?.code || 'upstream_error';
    console.warn('[cart-checkout] engine error', engineResp.status, code);
    return {
      statusCode: engineResp.status,
      headers: { 'Content-Type': 'application/json' },
      body: engineResp.raw || JSON.stringify({ code, message: 'Could not start checkout.' }),
    };
  }

  // Engine succeeded. Log a lead event best-effort (don't block on failure).
  logCartStarted(body, engineResp.json).catch((e) => {
    console.warn('[cart-checkout] lead_event log failed', e.message);
  });

  return jsonResponse(200, engineResp.json);
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validate(body) {
  if (!Number.isInteger(body.plan_id) || body.plan_id < 1) {
    return 'plan_id is required (positive integer).';
  }
  if (!body.sales_order_number || !String(body.sales_order_number).trim()) {
    return 'sales_order_number is required.';
  }
  if (!Number.isInteger(body.amount_cents) || body.amount_cents < 50) {
    return 'amount_cents is required (integer >= 50).';
  }
  if (body.coverage_retail_cents != null &&
      (!Number.isInteger(body.coverage_retail_cents) || body.coverage_retail_cents < 0)) {
    return 'coverage_retail_cents must be a non-negative integer.';
  }
  if (!body.customer || typeof body.customer !== 'object') {
    return 'customer is required.';
  }
  if (!body.customer.name || !String(body.customer.name).trim()) {
    return 'customer.name is required.';
  }
  if (String(body.customer.name).length > 200) {
    return 'customer.name must be 200 characters or less.';
  }
  if (!body.customer.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.customer.email).trim())) {
    return 'customer.email is invalid.';
  }
  return null;
}

async function logCartStarted(body, engineResponse) {
  if (!supabase) return;

  const email = String(body.customer.email).trim().toLowerCase();

  // Upsert lead so we have a lead_id for the event row.
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .upsert(
      {
        email,
        consent_at: body.consent_text ? new Date().toISOString() : null,
        consent_text: body.consent_text || null,
      },
      { onConflict: 'email' }
    )
    .select('id')
    .single();

  if (leadErr || !lead) {
    console.warn('[cart-checkout] lead upsert returned no row', leadErr?.message);
    return;
  }

  await supabase.from('lead_events').insert({
    lead_id: lead.id,
    event_type: 'cart_started',
    source: 'cart_started',
    payload: {
      coverage_retail_cents: body.coverage_retail_cents ?? null,
      referral_code: body.referral_code || null,
      items_covered: body.items_covered || null,
      designer_attributed: engineResponse?.designer_attributed || false,
      amount_cents: engineResponse?.amount_cents || null,
      commission_cents: engineResponse?.commission_cents ?? null,
      payment_intent_id: engineResponse?.payment_intent_id || null,
    },
  });
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function errorResponse(statusCode, code, message) {
  return jsonResponse(statusCode, { code, message });
}
