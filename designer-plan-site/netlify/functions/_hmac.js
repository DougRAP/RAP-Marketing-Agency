// Shared HMAC signing helper for server-to-server calls to the
// fulfillment engine (Spring Boot at designerplan.io).
//
// This is the Node mirror of HmacAuthFilter.java + HmacTestUtils.java in
// the Designers repo. The signing algorithm is intentionally identical so
// the engine's filter accepts what we sign here.
//
//   signingString = METHOD + "\n" + PATH_AND_QUERY + "\n" + TIMESTAMP + "\n" + SHA256_HEX(BODY)
//   signature     = HMAC-SHA256(secret, signingString) → lowercase hex
//
// 3 headers are sent on every request:
//   X-RAP-Signature  — the hex signature
//   X-RAP-Timestamp  — ISO-8601 instant, e.g. "2026-05-23T17:27:53.979Z"
//   X-RAP-Key-Id     — must match an id in HmacKeyStore on the engine side
//
// Required Netlify env vars:
//   HMAC_KEY_ID      — e.g., "netlify-prod"
//   HMAC_SECRET      — the base64-ish shared secret tied to that id
//   ENGINE_BASE_URL  — e.g., "https://designerplan.io" or "http://localhost:8080"

const crypto = require('crypto');

const KEY_ID = process.env.HMAC_KEY_ID;
const SECRET = process.env.HMAC_SECRET;
const ENGINE_BASE_URL = process.env.ENGINE_BASE_URL;

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hmacSha256Hex(secret, data) {
  return crypto.createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

/**
 * Compute a signature for a single request. Exposed for testing — most
 * callers want signedHeaders() or callEngine() which wrap this.
 *
 * @param {string} method        HTTP method, will be uppercased
 * @param {string} pathAndQuery  the URI the engine will see, including ?query if any
 * @param {string|Buffer|null} body  request body — empty string / null for GET
 * @param {string} timestamp     ISO-8601 instant string (matches the X-RAP-Timestamp header)
 * @param {string} secret        the shared HMAC secret
 * @returns {string} lowercase hex signature
 */
function computeSignature(method, pathAndQuery, body, timestamp, secret) {
  const bodyBuf = !body
    ? Buffer.alloc(0)
    : (Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8'));
  const bodyHash = sha256Hex(bodyBuf);
  const signingString = [
    String(method).toUpperCase(),
    pathAndQuery,
    timestamp,
    bodyHash,
  ].join('\n');
  return hmacSha256Hex(secret, signingString);
}

/**
 * Build the 3 HMAC headers for a request. Uses env-loaded KEY_ID + SECRET.
 *
 * The bodyString must match EXACTLY what will be sent over the wire — same
 * bytes, same encoding. If you JSON.stringify here, send those exact bytes;
 * don't re-stringify downstream.
 */
function signedHeaders(method, pathAndQuery, bodyString) {
  if (!KEY_ID || !SECRET) {
    throw new Error('HMAC_KEY_ID and HMAC_SECRET must be set in env');
  }
  const timestamp = new Date().toISOString();
  const signature = computeSignature(method, pathAndQuery, bodyString || '', timestamp, SECRET);
  return {
    'X-RAP-Signature': signature,
    'X-RAP-Timestamp': timestamp,
    'X-RAP-Key-Id': KEY_ID,
  };
}

/**
 * Make a signed call to the engine and return { status, json, raw }.
 *
 * - GETs send no body; bodyHash is SHA-256 of empty bytes (matches engine).
 * - POSTs JSON-stringify `body` and send those exact bytes.
 *
 * Throws on network failure. HTTP error responses are NOT thrown — caller
 * checks `status` and `json.code` to decide.
 */
async function callEngine(method, pathAndQuery, body) {
  if (!ENGINE_BASE_URL) {
    throw new Error('ENGINE_BASE_URL must be set in env');
  }
  const m = String(method).toUpperCase();
  const bodyString = (m === 'GET' || body == null) ? '' : JSON.stringify(body);

  const headers = {
    'Accept': 'application/json',
    ...signedHeaders(m, pathAndQuery, bodyString),
  };
  if (m !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(`${ENGINE_BASE_URL}${pathAndQuery}`, {
    method: m,
    headers,
    body: m === 'GET' ? undefined : bodyString,
  });

  const raw = await res.text();
  let json = null;
  if (raw) {
    try { json = JSON.parse(raw); } catch { /* not json; leave as null */ }
  }
  return { status: res.status, json, raw };
}

module.exports = {
  computeSignature,
  signedHeaders,
  callEngine,
};
