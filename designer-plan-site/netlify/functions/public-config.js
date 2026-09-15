// netlify/functions/public-config.js
// Returns the values the browser needs to talk to Supabase directly:
//   - SUPABASE_URL: the public project endpoint.
//   - SUPABASE_ANON_KEY: the "publishable" key, gated by RLS on every table.
//   - STRIPE_PUBLISHABLE_KEY (optional): Stripe's client-side publishable key,
//     used by the checkout page to confirm a PaymentIntent. Public by design.
// The SERVICE_ROLE_KEY and Stripe SECRET key are server-side only and never appear here.

exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY env var on the site.'
      })
    };
  }

  // Stripe publishable key (pk_live_… / pk_test_…). Public by design — it's the
  // client-side key; the SECRET key never leaves the engine. Included only when
  // set so the response degrades gracefully during rollout.
  const stripePublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const payload = { url, anonKey };
  if (stripePublishableKey) payload.stripePublishableKey = stripePublishableKey;

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300'
    },
    body: JSON.stringify(payload)
  };
};
