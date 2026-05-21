// /.netlify/functions/partner-apply
//
// Profile enrichment for an already-signed-in partner. The function
// UPDATES an existing partners row (created by account-bootstrap on first
// sign-in); it never creates accounts.
//
// Auth: requires a valid Supabase JWT in the Authorization header.
// Returns 401 if no partner row exists for the authenticated user — that
// means account-bootstrap was not run, which is a bug at the call site.
//
// All form fields are optional. An empty submit is a valid no-op.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'method_not_allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'missing_bearer_token' })
    };
  }
  const jwt = authHeader.substring(7);

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'supabase_not_configured' })
    };
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
  if (userError || !user) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'invalid_token' })
    };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) {
    return {
      statusCode: 400,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'bad_json' })
    };
  }

  // Honeypot
  if (body.hp) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: true })
    };
  }

  // Find the partner row that bootstrap created
  const { data: partner, error: partnerLookupErr } = await supabase
    .from('partners')
    .select('id, lead_id, studio_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (partnerLookupErr) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'partner_lookup_failed', detail: partnerLookupErr.message })
    };
  }

  if (!partner) {
    return {
      statusCode: 401,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'no_partner_row',
        detail: 'Call /.netlify/functions/account-bootstrap before submitting the profile form.'
      })
    };
  }

  // Build update payloads — every field optional. Only set keys the
  // caller actually supplied so we never overwrite existing data with null.
  const partnerUpdate = {};
  const leadUpdate = {};

  if (body.studio_name || body.company) {
    partnerUpdate.studio_name = body.studio_name || body.company;
    leadUpdate.company = partnerUpdate.studio_name;
  }
  if (Array.isArray(body.products) && body.products.length > 0) {
    partnerUpdate.specializes_in = body.products;
  }
  if (body.average_project_size) {
    partnerUpdate.avg_job_size = body.average_project_size;
    leadUpdate.average_project_size = body.average_project_size;
  }
  if (body.extra_profile_notes) {
    partnerUpdate.extra_profile_notes = body.extra_profile_notes;
  }
  if (body.full_name) leadUpdate.full_name = body.full_name;
  if (body.phone) leadUpdate.phone = body.phone;
  if (body.full_address || body.address) leadUpdate.address = body.full_address || body.address;
  if (body.clients_per_year) leadUpdate.clients_per_year = body.clients_per_year;

  // Apply partner update if anything to update
  if (Object.keys(partnerUpdate).length > 0) {
    const { error: pErr } = await supabase
      .from('partners')
      .update(partnerUpdate)
      .eq('id', partner.id);
    if (pErr) {
      return {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'partner_update_failed', detail: pErr.message })
      };
    }
  }

  // Apply lead update if we have a lead_id and anything to update
  if (partner.lead_id && Object.keys(leadUpdate).length > 0) {
    const { error: lErr } = await supabase
      .from('leads')
      .update(leadUpdate)
      .eq('id', partner.lead_id);
    if (lErr) {
      // Non-fatal — lead enrichment is best-effort
      console.warn('lead update failed', lErr.message);
    }
  }

  // Event — only log if the caller actually submitted something
  if (Object.keys(partnerUpdate).length > 0 || Object.keys(leadUpdate).length > 0) {
    await supabase.from('lead_events').insert({
      lead_id: partner.lead_id,
      event_type: 'profile_updated',
      source: 'partner_apply_form',
      payload: {
        fields: Object.keys(partnerUpdate).concat(Object.keys(leadUpdate)),
        user_agent: event.headers['user-agent'] || null,
        ip: event.headers['x-nf-client-connection-ip'] || null
      }
    });
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ok: true,
      partner_id: partner.id,
      updated: Object.keys(partnerUpdate)
    })
  };
};
