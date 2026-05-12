// /.netlify/functions/cart-checkout
// STUB. The real checkout already exists downstream; this function exists
// so cart.js has a real endpoint to hit. Dev team replaces the body with
// the real handoff (Stripe Checkout session, or whatever the existing
// cart backend expects).
//
// Until then: logs a 'cart_started' lead_event if we can identify a lead
// by email, and returns { checkout_url: null } so cart.js shows the
// "in development" toast.

const { supabase } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'bad_json' }) }; }

  // Log analytic event if we have a partner_id (we know the lead via partners.lead_id)
  if (supabase && body.partner_id) {
    try {
      const { data: partner } = await supabase
        .from('partners')
        .select('lead_id')
        .eq('id', body.partner_id)
        .maybeSingle();
      if (partner) {
        await supabase.from('lead_events').insert({
          lead_id: partner.lead_id,
          event_type: 'cart_started',
          source: 'cart_started',
          payload: { items: body.items || [] }
        });
      }
    } catch (e) { console.warn('cart_started log failed', e); }
  }

  // TODO(dev-team): create Stripe Checkout session or call existing cart backend,
  // then return { checkout_url: <url> }. For now returning null routes cart.js
  // back to its "in development" message.
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checkout_url: null, message: 'checkout_not_yet_wired' })
  };
};
