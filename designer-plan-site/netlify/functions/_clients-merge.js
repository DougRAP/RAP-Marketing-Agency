// The clients join of contract F (docs/dashboard-data-contract.md): the
// designer's prospects (Supabase public.partner_clients) merged with their
// sales (the engine's commissions), keyed on the client's email, lowercased.
//
//   loadProspects(supabase, partnerId) -> Promise<prospect[]>   newest first
//   buildClients(prospects, commissions) -> client[]
//
// One client row per commission (a prospect who bought twice is two rows
// sharing the prospect's id), then one row per prospect that matched no
// sale. Status is derived, never stored:
//
//   active     matching sale, months_remaining > 0 (or absent)
//   expired    matching sale, months_remaining = 0
//   link_sent  no sale, link_sent_at set
//   added      no sale, link_sent_at null
//
// A commission without a customer_email never matches; a sale with no
// prospect still shows, under the customer's last name and with a null id.
// Pure functions, no I/O apart from loadProspects.

const PROSPECT_COLUMNS = 'id, client_name, project_name, client_email, client_phone, notes, link_sent_at, link_sent_count, created_at';

function lowerEmail(value) {
  const s = value == null ? '' : String(value).trim().toLowerCase();
  return s || null;
}

async function loadProspects(supabase, partnerId) {
  const { data, error } = await supabase
    .from('partner_clients')
    .select(PROSPECT_COLUMNS)
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message || 'prospects query failed');
  return data || [];
}

function saleRow(c, p) {
  return {
    id: p ? p.id : null,
    client_name: p ? p.client_name : (c.customer_last_name || ''),
    project_name: p ? (p.project_name == null ? null : p.project_name) : null,
    client_email: lowerEmail(c.customer_email),
    status: c.months_remaining === 0 ? 'expired' : 'active',
    link_sent_at: p ? (p.link_sent_at == null ? null : p.link_sent_at) : null,
    link_sent_count: p ? (Number(p.link_sent_count) || 0) : 0,
    plan_number: c.plan_number || null,
    months_remaining: c.months_remaining == null ? null : c.months_remaining,
    plan_registration_id: c.plan_registration_id == null ? null : c.plan_registration_id
  };
}

function prospectRow(p) {
  return {
    id: p.id,
    client_name: p.client_name,
    project_name: p.project_name == null ? null : p.project_name,
    client_email: lowerEmail(p.client_email),
    status: p.link_sent_at ? 'link_sent' : 'added',
    link_sent_at: p.link_sent_at == null ? null : p.link_sent_at,
    link_sent_count: Number(p.link_sent_count) || 0,
    plan_number: null,
    months_remaining: null,
    plan_registration_id: null
  };
}

function buildClients(prospects, commissions) {
  const ps = prospects || [];
  const cs = commissions || [];
  const byEmail = new Map();
  ps.forEach((p) => {
    const key = lowerEmail(p.client_email);
    if (key && !byEmail.has(key)) byEmail.set(key, p);
  });

  const matched = new Set();
  const rows = cs.map((c) => {
    const key = lowerEmail(c.customer_email);
    const p = key ? byEmail.get(key) : undefined;
    if (p) matched.add(p);
    return saleRow(c, p);
  });

  ps.forEach((p) => {
    if (!matched.has(p)) rows.push(prospectRow(p));
  });
  return rows;
}

module.exports = { buildClients, loadProspects, PROSPECT_COLUMNS };
