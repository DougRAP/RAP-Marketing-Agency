// /.netlify/functions/lead-capture
//
// Outgoing-webhook handler for Netlify Forms on the rap-designer-programs site.
// Receives "submission-created" events for the two forms on this site:
//   - whitepaper-request   (whitepaper download)
//   - designer-sign-up     (designer onboarding)
//
// For each submission, it:
//   1. Upserts the lead by email (citext unique key).
//   2. Inserts a 'form_submitted' row in lead_events with source = form_name
//      and the full submission body preserved in payload jsonb.
//   3. Adds the lead to the 'designers-all' email_lists membership.
//
// The HTML forms are still native Netlify Forms (data-netlify="true"), so
// Netlify keeps a copy of every submission in its own dashboard as a backup
// if Supabase or this function is unavailable.

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

  // Netlify "submission-created" puts form_name + data at the top level of the
  // POST body. Some integrations wrap it under "payload" — handle both shapes.
  const root = body.payload && typeof body.payload === 'object' ? body.payload : body;
  const formName = root.form_name;
  const data = root.data || {};

  if (!formName) {
    console.warn('[lead-capture] missing form_name in webhook body');
    return { statusCode: 400, body: JSON.stringify({ error: 'missing_form_name' }) };
  }

  // Honeypot: bots fill bot-field. Drop silently with 200 — before any mapping
  // or schema work to match the pattern in popup-capture.js and partner-apply.js.
  if (data['bot-field']) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'honeypot' }) };
  }

  if (!CONSENT_TEXT[formName]) {
    // Unknown form — return 200 so Netlify doesn't retry forever, but don't write.
    console.warn('[lead-capture] unknown form_name received:', formName);
    return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: 'unknown_form', form_name: formName }) };
  }

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
      site_url: root.site_url || null,
      netlify_submission_id: root.id || null,
      ip: root.ip || event.headers['x-nf-client-connection-ip'] || null,
      user_agent: root.user_agent || event.headers['user-agent'] || null,
      submitted_at: root.created_at || null
    },
    created_by: 'lead-capture'
  });

  if (eventErr) {
    // Lead already exists; an event-insert failure is logged but not fatal
    // to the webhook response (otherwise Netlify will retry and double-write).
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
