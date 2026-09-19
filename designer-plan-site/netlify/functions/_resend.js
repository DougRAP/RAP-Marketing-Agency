// Thin wrapper over the Resend HTTP API for transactional mail sent by
// Netlify Functions (contract F: the client plan link). Auth mail goes
// through Supabase's SMTP settings and never touches this file.
//
//   isConfigured()                    RESEND_API_KEY is set (read at call time,
//                                     so a missing key fails per request, not per cold start)
//   sendEmail({ to, replyTo, subject, text, html }, deps) -> { id }
//     deps.fetchImpl  default global fetch (tests inject)
//     deps.apiKey     default process.env.RESEND_API_KEY
//     deps.timeoutMs  default 4000; the call is aborted past that so the
//                     function always has time left to record the send
//
// Throws an Error with .code:
//   'email_not_configured'  no API key
//   'email_failed'          non-2xx from Resend (.status set) or a network error
//
// Required Netlify env var: RESEND_API_KEY (send-only key, see contract E.5).

const RESEND_URL = 'https://api.resend.com/emails';
const FROM = 'Designer Plan <no-reply@send.thedesignerplan.com>';
const DEFAULT_TIMEOUT_MS = 4000;

function apiKeyFromEnv() {
  return (process.env.RESEND_API_KEY || '').trim();
}

function isConfigured() {
  return apiKeyFromEnv().length > 0;
}

function failure(code, message, status) {
  const err = new Error(message);
  err.code = code;
  if (status != null) err.status = status;
  return err;
}

async function sendEmail(message, deps) {
  const d = deps || {};
  const apiKey = d.apiKey || apiKeyFromEnv();
  if (!apiKey) throw failure('email_not_configured', 'RESEND_API_KEY is not set');
  const fetchImpl = d.fetchImpl || global.fetch;
  const timeoutMs = d.timeoutMs || DEFAULT_TIMEOUT_MS;

  const payload = {
    from: FROM,
    to: [message.to],
    reply_to: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    const why = controller.signal.aborted ? 'timed out after ' + timeoutMs + ' ms' : 'unreachable';
    throw failure('email_failed', 'Resend ' + why);
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let json = null;
  if (raw) {
    try { json = JSON.parse(raw); } catch { /* not json; leave as null */ }
  }

  if (!res.ok) {
    // Resend's error body echoes the recipient; keep it out of the error
    // (and therefore out of the logs). The status is enough to act on.
    throw failure('email_failed', 'Resend answered ' + res.status, res.status);
  }
  return { id: json && json.id };
}

module.exports = { isConfigured, sendEmail, FROM, RESEND_URL };
