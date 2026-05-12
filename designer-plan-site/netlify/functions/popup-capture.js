// /.netlify/functions/popup-capture
// Receives the landing-page Burrow-style popup submission.
// Upserts a lead by email, logs a 'form_submitted' lead_event with
// source='landing_popup', records consent.

const { supabase } = require('./_supabase');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!supabase) {
    return { statusCode: 500, body: JSON.stringify({ error: 'supabase_not_configured' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'bad_json' }) }; }

  // Honeypot — silently accept and drop
  if (body.hp) {
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  const email = (body.email || '').toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_email' }) };
  }

  // 1. Upsert lead
  const leadPayload = {
    email,
    company: body.company || null,
    consent_at: new Date().toISOString(),
    consent_text: body.consent_text || null
  };

  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .upsert(leadPayload, { onConflict: 'email' })
    .select()
    .single();

  if (leadErr) {
    console.error('lead upsert failed', leadErr);
    return { statusCode: 500, body: JSON.stringify({ error: 'lead_upsert_failed' }) };
  }

  // 2. Append event
  const { error: eventErr } = await supabase
    .from('lead_events')
    .insert({
      lead_id: lead.id,
      event_type: 'form_submitted',
      source: 'landing_popup',
      payload: {
        ...body,
        landing_url: body.landing_url || null,
        referrer: body.referrer || null,
        user_agent: event.headers['user-agent'] || null,
        ip: event.headers['x-nf-client-connection-ip'] || null
      }
    });

  if (eventErr) {
    console.error('lead_event insert failed', eventErr);
  }

  // 3. Auto-add to the 'designers-all' email list
  try {
    const { data: list } = await supabase
      .from('email_lists')
      .select('id')
      .eq('slug', 'designers-all')
      .maybeSingle();
    if (list) {
      await supabase
        .from('email_list_members')
        .upsert({ list_id: list.id, lead_id: lead.id, added_by: 'popup-capture' });
    }
  } catch (e) {
    console.warn('list add failed', e);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, lead_id: lead.id })
  };
};
