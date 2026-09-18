// netlify/functions/dashboard-data.js
//
// Contract B of docs/dashboard-data-contract.md: the browser asks for the
// signed-in partner's sales and commission, and this function asks the
// engine on its behalf.
//
//   browser --JWT--> dashboard-data --HMAC--> engine POST /api/v1/partner/dashboard
//
// GET only, no query string, no body. The email comes from the Supabase JWT
// and nowhere else, so nobody can ask for another partner's numbers.
//
//   engine 200            -> 200, engine body plus linked:true
//   engine 404            -> 200 { linked: false }   (normal for a new signup)
//   engine 401            -> 502 upstream_unavailable + console.error (our HMAC creds are wrong)
//   engine 5xx / down     -> 502 upstream_unavailable
//
// Errors are { code, message } like cart-checkout.js. Never logs the JWT or
// the email.
//
// createHandler(deps) exists for the unit tests: getUser and callEngine are
// injectable so nothing touches the network there.

const { createClient } = require('@supabase/supabase-js');
const hmac = require('./_hmac');

const ENGINE_PATH = '/api/v1/partner/dashboard';
// Netlify Functions time out at 10 s; leave room to answer with a 502.
const ENGINE_TIMEOUT_MS = 8000;
const UNAVAILABLE_MESSAGE = 'Sales data is temporarily unavailable. Please try again.';

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ENGINE_BASE_URL',
  'HMAC_KEY_ID',
  'HMAC_SECRET'
];

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function errorResponse(statusCode, code, message) {
  return jsonResponse(statusCode, { code, message });
}

function missingEnv() {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

function defaultGetUser(jwt) {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return supabase.auth.getUser(jwt);
}

function bearerToken(event) {
  const headers = event.headers || {};
  const authHeader = headers.authorization || headers.Authorization || '';
  return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
}

function createHandler(deps) {
  const d = deps || {};
  const getUser = d.getUser || defaultGetUser;
  const callEngine = d.callEngine || hmac.callEngine;
  const timeoutMs = d.timeoutMs || ENGINE_TIMEOUT_MS;

  return async (event) => {
    if (event.httpMethod !== 'GET') {
      return errorResponse(405, 'method_not_allowed', 'Use GET.');
    }

    const jwt = bearerToken(event);
    if (!jwt) {
      return errorResponse(401, 'missing_bearer_token', 'Sign in to see your dashboard.');
    }

    const missing = missingEnv();
    if (missing.length) {
      console.error('[dashboard-data] missing env: ' + missing.join(', '));
      return errorResponse(500, 'server_misconfigured', 'Server configuration is incomplete.');
    }

    const { data, error } = await getUser(jwt);
    const user = data && data.user;
    if (error || !user || !user.email) {
      return errorResponse(401, 'invalid_token', 'Your session is not valid. Sign in again.');
    }

    // AbortController + setTimeout rather than AbortSignal.timeout(): the
    // timer is cleared as soon as the engine answers, and it keeps the event
    // loop alive, which AbortSignal.timeout's unref'd timer does not.
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort(new DOMException('Engine call timed out', 'TimeoutError'));
    }, timeoutMs);

    let res;
    try {
      res = await callEngine('POST', ENGINE_PATH, { email: user.email }, { signal: controller.signal });
    } catch (e) {
      console.warn('[dashboard-data] engine unreachable: ' + ((e && e.name) || 'error'));
      return errorResponse(502, 'upstream_unavailable', UNAVAILABLE_MESSAGE);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 200 && res.json) {
      // B7 joins the partner's prospects (contract F) here, adding `clients`.
      return jsonResponse(200, Object.assign({}, res.json, { linked: true }));
    }

    if (res.status === 404) {
      return jsonResponse(200, { linked: false });
    }

    if (res.status === 401) {
      // The engine rejected our own HMAC credentials: an ops problem, never the user's.
      console.error('[dashboard-data] engine rejected HMAC credentials (401); check HMAC_KEY_ID / HMAC_SECRET');
      return errorResponse(502, 'upstream_unavailable', UNAVAILABLE_MESSAGE);
    }

    console.warn('[dashboard-data] unexpected engine response: status ' + res.status);
    return errorResponse(502, 'upstream_unavailable', UNAVAILABLE_MESSAGE);
  };
}

module.exports = {
  handler: createHandler(),
  createHandler
};
