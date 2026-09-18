// /.netlify/functions/client-send-link
//
// Contract F of docs/dashboard-data-contract.md: the signed-in designer
// sends (or re-sends) the plan link to one of their prospects. The link is
// /plans?ref=<affiliated_id>, so the account has to be linked to a SOAR
// dealer first; the engine is the source of truth for that (contract A).
//
//   POST { client_id }
//   Authorization: Bearer <supabase access_token>
//
// Order of checks, so nothing is sent by mistake:
//   1. JWT -> user; partners row -> partner
//   2. partner_clients row must exist AND belong to that partner (else 404)
//   3. rate cap: one send per client per 10 minutes (followups item 6)
//   4. engine: 404 -> 409 not_linked; down / 5xx / 401 -> 502 upstream_unavailable
//   5. RESEND_API_KEY present, else 503 email_not_configured
//   6. send via Resend; failure -> 502 email_failed, row untouched
//   7. stamp link_sent_at = now, link_sent_count + 1; return the updated row
//
// Response 200: the updated partner_clients row
//   { id, client_name, project_name, client_email, client_phone, notes,
//     link_sent_at, link_sent_count, created_at, updated_at }
//
// Errors are { code, message } like cart-checkout.js:
//   405 method_not_allowed   400 bad_json            400 validation_failed
//   401 missing_bearer_token 401 invalid_token       401 no_partner_row
//   404 not_found            409 not_linked          429 rate_limited
//   502 upstream_unavailable 502 email_failed        503 email_not_configured
//   500 server_misconfigured / lookup_failed / update_failed
//
// The email copy is versioned in docs/email-templates.md ("Client plan link").
//
// createHandler(deps) exists for the unit tests: supabase, now,
// fetchPartnerDashboard and resend are injectable so nothing touches the
// network there.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROW_COLUMNS = 'id, client_name, project_name, client_email, client_phone, notes, link_sent_at, link_sent_count, created_at, updated_at';
const SEND_WINDOW_MS = 10 * 60 * 1000;
const ENGINE_TIMEOUT_MS = 5000;
const PLANS_URL = 'https://thedesignerplan.com/plans';

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The message from docs/email-templates.md, "Client plan link". */
function buildMessage({ clientName, clientEmail, designerName, designerEmail, link }) {
  const subject = designerName + ' sent you your Designer Plan link';
  const text = [
    'Hi ' + clientName + ',',
    '',
    designerName + ' is sending you the link to protect your new furnishings with Designer Plan.',
    '',
    link,
    '',
    'Reply to this email to reach ' + designerName + ' directly.'
  ].join('\n');
  const safeClient = escapeHtml(clientName);
  const safeDesigner = escapeHtml(designerName);
  const safeLink = escapeHtml(link);
  const html = [
    '<p>Hi ' + safeClient + ',</p>',
    '<p>' + safeDesigner + ' is sending you the link to protect your new furnishings with Designer Plan.</p>',
    '<p><a href="' + safeLink + '">' + safeLink + '</a></p>',
    '<p>Reply to this email to reach ' + safeDesigner + ' directly.</p>'
  ].join('\n');
  return { to: clientEmail, replyTo: designerEmail, subject, text, html };
}

function createHandler(deps) {
  const d = deps || {};
  const supabase = 'supabase' in d ? d.supabase : require('./_supabase').supabase;
  const now = d.now || (() => new Date());
  const fetchPartnerDashboard = d.fetchPartnerDashboard || require('./_engine-dashboard').fetchPartnerDashboard;
  const resend = d.resend || require('./_resend');

  return async (event) => {
    if (event.httpMethod !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'POST only');
    }

    const authHeader = event.headers.authorization || event.headers.Authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return errorResponse(401, 'missing_bearer_token', 'Sign in to send a link.');
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

    const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
    if (!UUID_RE.test(clientId)) {
      return errorResponse(400, 'validation_failed', 'client_id is required (uuid).');
    }

    const { data: partner, error: partnerErr } = await supabase
      .from('partners')
      .select('id, studio_name')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (partnerErr) {
      console.error('[client-send-link] partner lookup failed', partnerErr.message);
      return errorResponse(500, 'lookup_failed', 'Could not load your account.');
    }
    if (!partner) {
      return errorResponse(401, 'no_partner_row', 'Your account is not set up yet. Reload the dashboard and try again.');
    }

    // Both filters on purpose: another partner's client id is a 404, not a 403,
    // so the response does not confirm the id exists.
    const { data: row, error: rowErr } = await supabase
      .from('partner_clients')
      .select('id, client_name, client_email, link_sent_at, link_sent_count')
      .eq('id', clientId)
      .eq('partner_id', partner.id)
      .maybeSingle();
    if (rowErr) {
      console.error('[client-send-link] client lookup failed', rowErr.message);
      return errorResponse(500, 'lookup_failed', 'Could not load that client.');
    }
    if (!row) {
      return errorResponse(404, 'not_found', 'That client is not on your list.');
    }

    const nowDate = now();
    if (row.link_sent_at && nowDate.getTime() - new Date(row.link_sent_at).getTime() < SEND_WINDOW_MS) {
      return errorResponse(429, 'rate_limited', 'A link was sent to this client in the last 10 minutes.');
    }

    let engine;
    try {
      engine = await fetchPartnerDashboard(user.email, { timeoutMs: ENGINE_TIMEOUT_MS });
    } catch (err) {
      console.error('[client-send-link] engine call failed', err.message);
      return errorResponse(502, 'upstream_unavailable', 'Sales data is temporarily unavailable. Please try again.');
    }
    if (engine.status === 404) {
      return errorResponse(409, 'not_linked', 'Your account is not linked to a sales account yet.');
    }
    if (engine.status !== 200 || !engine.json || !engine.json.affiliated_id) {
      if (engine.status === 401) {
        console.error('[client-send-link] engine rejected our HMAC signature (401); check HMAC_KEY_ID / HMAC_SECRET');
      } else {
        console.error('[client-send-link] engine answered', engine.status);
      }
      return errorResponse(502, 'upstream_unavailable', 'Sales data is temporarily unavailable. Please try again.');
    }

    // Checked after the engine on purpose: an unlinked account gets the
    // more useful answer (409) even on an environment with no mail key.
    if (!resend.isConfigured()) {
      return errorResponse(503, 'email_not_configured', 'Email sending is not configured on this environment.');
    }

    const designerName = partner.studio_name || engine.json.dealer_name || user.email;
    const message = buildMessage({
      clientName: row.client_name,
      clientEmail: row.client_email,
      designerName,
      designerEmail: user.email,
      link: PLANS_URL + '?ref=' + encodeURIComponent(engine.json.affiliated_id)
    });

    try {
      await resend.sendEmail(message);
    } catch (err) {
      console.error('[client-send-link] send failed', err.code, err.status || '', err.message);
      return errorResponse(502, 'email_failed', 'The email could not be sent. Please try again.');
    }

    const { data: updated, error: updateErr } = await supabase
      .from('partner_clients')
      .update({ link_sent_at: nowDate.toISOString(), link_sent_count: row.link_sent_count + 1 })
      .eq('id', row.id)
      .select(ROW_COLUMNS)
      .single();
    if (updateErr) {
      // The email already went out; the row just does not say so yet.
      console.error('[client-send-link] update failed after send', row.id, updateErr.message);
      return errorResponse(500, 'update_failed', 'The link was sent but could not be recorded. Refresh to check.');
    }

    return jsonResponse(200, updated);
  };
}

exports.createHandler = createHandler;
exports.handler = createHandler();
