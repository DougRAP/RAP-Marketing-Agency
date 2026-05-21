// /.netlify/functions/lead-capture
//
// Direct fetch endpoint for the two forms on rap-public-site:
//   - whitepaper-request   (whitepaper download)
//   - designer-sign-up     (designer onboarding)
//
// Both forms POST a flat JSON body with `form_name` plus the field values
// (same shape as designer-plan-site's popup-capture and partner-apply).
//
// For each submission, it:
//   1. Upserts the lead by email (citext unique key).
//   2. Inserts a 'form_submitted' row in lead_events with source = form_name
//      and the full submission body preserved in payload jsonb.
//   3. Adds the lead to the 'designers-all' email_lists membership.
//
// Supabase is the single source of truth — there is no Netlify Forms backup
// anymore. If this function fails, the browser shows an inline error and the
// visitor can retry.

const { supabase } = require('./_supabase');

// Consent strings are anchored here (and on the leads row) on submission time,
// so that future copy edits on the HTML pages don't retroactively rewrite
// what each historical lead agreed to.
const CONSENT_TEXT = {
  'whitepaper-request':
    'We will only use your contact information to send the white paper and follow up about Designer Protection Plan. No third-party sharing.',
  'designer-sign-up':
    'Your information goes directly to the Designer Programs team at Risk Assurance Partners. We will reach out within one business day.'
};

function mapLead(formName, data) {
  const email = (data.email || '').toLowerCase().trim();
  const base = {
    email,
    full_name: data.name || null,
    phone: data.phone || null,
    consent_at: new Date().toISOString(),
    consent_text: CONSENT_TEXT[formName] || null
  };

  if (formName === 'whitepaper-request') {
    return Object.assign(base, {
      company: data.firm || null
    });
  }

  if (formName === 'designer-sign-up') {
    return Object.assign(base, {
      company: data.company || null,
      address: data.address || null,
      average_project_size: data.average_project_size || null,
      clients_per_year: data.clients_per_year || null
    });
  }

  return base;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!supabase) {
    console.error('[lead-capture] Supabase not configured (missing env vars)');
    return { statusCode: 500, body: JSON.stringify({ error: 'supabase_not_configured' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'bad_json' }) };
  }

  // Browser posts a flat JSON: { form_name, email, name, phone, ... bot-field }.
  const formName = body.form_name;

  if (!formName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'missing_form_name' }) };
  }

  // Honeypot: bots fill bot-field. Drop silently with 200 — same pattern as
  // popup-capture.js and partner-apply.js.
  if (body['bot-field']) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'honeypot' }) };
  }

  if (!CONSENT_TEXT[formName]) {
    console.warn('[lead-capture] unknown form_name received:', formName);
    return { statusCode: 400, body: JSON.stringify({ error: 'unknown_form_name', form_name: formName }) };
  }

  const data = body;

  const lead = mapLead(formName, data);
  if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_email' }) };
  }

  // 1. Upsert lead
  const { data: leadRow, error: leadErr } = await supabase
    .from('leads')
    .upsert(lead, { onConflict: 'email' })
    .select()
    .single();

  if (leadErr) {
    console.error('[lead-capture] lead upsert failed', leadErr);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'lead_upsert_failed', detail: leadErr.message })
    };
  }

  // 2. Append the submission as an event. Preserve the raw payload for audit.
  const { error: eventErr } = await supabase.from('lead_events').insert({
    lead_id: leadRow.id,
    event_type: 'form_submitted',
    source: formName,
    payload: {
      ...data,
      referer: event.headers['referer'] || event.headers['referrer'] || null,
      ip: event.headers['x-nf-client-connection-ip'] || null,
      user_agent: event.headers['user-agent'] || null
    },
    created_by: 'lead-capture'
  });

  if (eventErr) {
    // Lead already exists; event-insert failure is logged but not fatal so the
    // browser still gets a 200 and the visitor still lands on thank-you.
    console.error('[lead-capture] lead_event insert failed', eventErr);
  }

  // 3. Auto-add to the 'designers-all' email list.
  try {
    const { data: list } = await supabase
      .from('email_lists')
      .select('id')
      .eq('slug', 'designers-all')
      .maybeSingle();
    if (list) {
      await supabase
        .from('email_list_members')
        .upsert({ list_id: list.id, lead_id: leadRow.id, added_by: 'lead-capture' });
    }
  } catch (e) {
    console.warn('[lead-capture] list add failed', e);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, lead_id: leadRow.id, form_name: formName })
  };
};
