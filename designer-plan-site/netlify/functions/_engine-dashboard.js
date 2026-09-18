// Shared "ask the engine about this partner" call (contract A of
// docs/dashboard-data-contract.md), used by client-send-link.js to learn
// whether the signed-in designer is linked to a SOAR dealer and what their
// affiliated_id is.
//
//   fetchPartnerDashboard(email, opts) -> Promise<{ status, json, raw }>
//
//   opts.timeoutMs   abort the call after this many ms (default 8000; Netlify
//                    Functions die at 10 s, so leave room to answer)
//   opts.callEngine  injection point for tests (default: _hmac.callEngine)
//
// HTTP statuses come back as-is for the caller to map. A network failure or
// a timeout rejects with err.code = 'upstream_unavailable'.

const hmac = require('./_hmac');

const ENGINE_PATH = '/api/v1/partner/dashboard';
const DEFAULT_TIMEOUT_MS = 8000;

async function fetchPartnerDashboard(email, opts) {
  const o = opts || {};
  const callEngine = o.callEngine || hmac.callEngine;
  const timeoutMs = o.timeoutMs || DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await callEngine('POST', ENGINE_PATH, { email }, { signal: controller.signal });
  } catch (err) {
    const wrapped = new Error('engine unreachable: ' + ((err && err.message) || String(err)));
    wrapped.code = 'upstream_unavailable';
    wrapped.cause = err;
    throw wrapped;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchPartnerDashboard, ENGINE_PATH, DEFAULT_TIMEOUT_MS };
