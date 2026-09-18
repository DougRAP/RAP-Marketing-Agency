// /.netlify/functions/client-add
//
// Contract F of docs/dashboard-data-contract.md: the signed-in designer adds
// a prospect to their client list. The row lives in public.partner_clients;
// it is the designer's own client data, so it never touches `leads` and
// carries no consent_text (see docs/phase-2-followups.md item 4).
//
//   POST { client_name, project_name?, client_email, client_phone?, notes?, hp? }
//   Authorization: Bearer <supabase access_token>
//
// Response 201: the inserted row
//   { id, client_name, project_name, client_email, client_phone, notes,
//     link_sent_at, link_sent_count, created_at, updated_at }
//
// Errors are { code, message } like cart-checkout.js:
//   405 method_not_allowed   400 bad_json          400 validation_failed (names the field)
//   401 missing_bearer_token 401 invalid_token     401 no_partner_row
//   409 duplicate_client     500 server_misconfigured / lookup_failed / insert_failed
// Honeypot (body.hp truthy): 200 { ok: true, honeypot: true }, nothing read or written.
//
// createHandler(deps) exists for the unit tests: `supabase` is injectable so
// nothing touches the network there.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROW_COLUMNS = 'id, client_name, project_name, client_email, client_phone, notes, link_sent_at, link_sent_count, created_at, updated_at';

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function errorResponse(statusCode, code, message) {
  return jsonResponse(statusCode, { code, message });
}

function cleanText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Returns { fields } or { error: 'message naming the field' }. */
function validate(body) {
  const clientName = cleanText(body.client_name);
  if (!clientName) return { error: 'client_name is required.' };
  if (clientName.length > 200) return { error: 'client_name must be 200 characters or less.' };

  const clientEmail = cleanText(body.client_email).toLowerCase();
  if (!clientEmail) return { error: 'client_email is required.' };
  if (clientEmail.length > 254 || !EMAIL_RE.test(clientEmail)) return { error: 'client_email is invalid.' };

  const projectName = cleanText(body.project_name);
  if (projectName.length > 200) return { error: 'project_name must be 200 characters or less.' };

  const clientPhone = cleanText(body.client_phone);
  if (clientPhone.length > 50) return { error: 'client_phone must be 50 characters or less.' };

  const notes = cleanText(body.notes);
  if (notes.length > 2000) return { error: 'notes must be 2000 characters or less.' };

  return {
    fields: {
      client_name: clientName,
      project_name: projectName || null,
      client_email: clientEmail,
      client_phone: clientPhone || null,
      notes: notes || null
    }
  };
}

function createHandler(deps) {
  const d = deps || {};
  const supabase = 'supabase' in d ? d.supabase : require('./_supabase').supabase;

  return async (event) => {
    if (event.httpMethod !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'POST only');
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return errorResponse(401, 'missing_bearer_token', 'Sign in to add a client.');
    }
    const jwt = authHeader.substring(7);

    if (!supabase) {
      return errorResponse(500, 'server_misconfigured', 'Supabase is not configured.');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) {
      return errorResponse(401, 'invalid_token', 'Your session has expired. Sign in again.');
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return errorResponse(400, 'bad_json', 'Request body is not valid JSON.');
    }

    // Honeypot: silently accept and drop, before any validation or DB read.
    if (body.hp) {
      return jsonResponse(200, { ok: true, honeypot: true });
    }

    const checked = validate(body);
    if (checked.error) {
      return errorResponse(400, 'validation_failed', checked.error);
    }

    const { data: partner, error: partnerErr } = await supabase
      .from('partners')
      .select('id, studio_name')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (partnerErr) {
      console.error('[client-add] partner lookup failed', partnerErr.message);
      return errorResponse(500, 'lookup_failed', 'Could not load your account.');
    }
    if (!partner) {
      return errorResponse(401, 'no_partner_row', 'Your account is not set up yet. Reload the dashboard and try again.');
    }

    const { data: row, error: insertErr } = await supabase
      .from('partner_clients')
      .insert(Object.assign({ partner_id: partner.id }, checked.fields))
      .select(ROW_COLUMNS)
      .single();

    if (insertErr) {
      if (insertErr.code === '23505') {
        return errorResponse(409, 'duplicate_client', "That client's email is already on your list.");
      }
      console.error('[client-add] insert failed', insertErr.message);
      return errorResponse(500, 'insert_failed', 'Could not save the client. Please try again.');
    }

    return jsonResponse(201, row);
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
