// /.netlify/functions/partner-apply
// Receives the partner application form.
// Upserts lead, creates partners row with status='pending',
// logs a 'form_submitted' event with source='partner_application'.

const { supabase } = require('./_supabase');

function slugReferral(studio, email) {
  const base = (studio || email.split('@')[0] || 'partner')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${base}-${rand}`;
}

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

  if (body.hp) return { statusCode: 200, body: JSON.stringify({ ok: true }) };

  const email = (body.email || '').toLowerCase().trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'invalid_email' }) };
  }

  const studio = body.studio_name || body.company || null;

  // 1. Upsert lead
  const { data: lead, error: leadErr } = await supabase
    .from('leads')
    .upsert({
      email,
      full_name: body.full_name || null,
      phone: body.phone || null,
      company: studio,
      address: body.address || null,
      average_project_size: body.average_project_size || null,
      clients_per_year: body.clients_per_year || null,
      consent_at: new Date().toISOString(),
      consent_text: body.consent_text || null
    }, { onConflict: 'email' })
    .select()
    .single();

  if (leadErr) {
    console.error('lead upsert failed', leadErr);
    return { statusCode: 500, body: JSON.stringify({ error: 'lead_upsert_failed' }) };
  }

  // 2. Upsert partner row (one per lead)
  const { data: partner, error: partnerErr } = await supabase
    .from('partners')
    .upsert({
      lead_id: lead.id,
      studio_name: studio,
      referral_code: slugReferral(studio, email),
      status: 'pending'
    }, { onConflict: 'lead_id' })
    .select()
    .single();

  if (partnerErr) {
    console.error('partner upsert failed', partnerErr);
  }

  // 3. Event
  await supabase.from('lead_events').insert({
    lead_id: lead.id,
    event_type: 'form_submitted',
    source: 'partner_application',
    payload: {
      ...body,
      user_agent: event.headers['user-agent'] || null,
      ip: event.headers['x-nf-client-connection-ip'] || null
    }
  });

  // 4. Add to pending designers list
  try {
    const { data: list } = await supabase
      .from('email_lists').select('id').eq('slug', 'designers-pending').maybeSingle();
    if (list) {
      await supabase
        .from('email_list_members')
        .upsert({ list_id: list.id, lead_id: lead.id, added_by: 'partner-apply' });
    }
  } catch (e) { console.warn('list add failed', e); }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, lead_id: lead.id, partner_id: partner ? partner.id : null })
  };
};
