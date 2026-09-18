// Unit tests for netlify/functions/_engine-dashboard.js. callEngine is
// injected; nothing here touches the network.

const test = require('node:test');
const assert = require('node:assert/strict');

// _hmac.js reads its env at require time; give it something so requiring
// the helper under test never warns.
process.env.HMAC_KEY_ID = process.env.HMAC_KEY_ID || 'unit-test-key';
process.env.HMAC_SECRET = process.env.HMAC_SECRET || 'unit-test-secret';
process.env.ENGINE_BASE_URL = process.env.ENGINE_BASE_URL || 'http://engine.test';

const { fetchPartnerDashboard } = require('../../designer-plan-site/netlify/functions/_engine-dashboard');

function engineReplying(status, json) {
  const fn = async (method, path, body, opts) => {
    fn.calls.push({ method, path, body, opts });
    return { status, json, raw: json == null ? '' : JSON.stringify(json) };
  };
  fn.calls = [];
  return fn;
}

test('_engine-dashboard', async (t) => {
  await t.test('POSTs { email } to /api/v1/partner/dashboard with an abort signal', async () => {
    const callEngine = engineReplying(200, { affiliated_id: 'AB-RPFG' });
    const out = await fetchPartnerDashboard('designer@rapqa.com', { callEngine });
    assert.equal(out.status, 200);
    assert.deepEqual(out.json, { affiliated_id: 'AB-RPFG' });

    assert.equal(callEngine.calls.length, 1);
    const call = callEngine.calls[0];
    assert.equal(call.method, 'POST');
    assert.equal(call.path, '/api/v1/partner/dashboard');
    assert.deepEqual(call.body, { email: 'designer@rapqa.com' });
    assert.ok(call.opts && call.opts.signal instanceof AbortSignal, 'a signal is passed through');
    assert.equal(call.opts.signal.aborted, false, 'signal is not aborted on a normal reply');
  });

  await t.test('HTTP error statuses are returned, not thrown', async () => {
    const callEngine = engineReplying(404, { code: 'not_found', message: 'x' });
    const out = await fetchPartnerDashboard('designer@rapqa.com', { callEngine });
    assert.equal(out.status, 404);
    assert.equal(out.json.code, 'not_found');
  });

  await t.test('rejects with code upstream_unavailable when callEngine throws', async () => {
    const callEngine = async () => { throw new Error('fetch failed'); };
    await assert.rejects(
      () => fetchPartnerDashboard('designer@rapqa.com', { callEngine }),
      (err) => err.code === 'upstream_unavailable'
    );
  });

  await t.test('aborts after timeoutMs and rejects with upstream_unavailable', async () => {
    const callEngine = (method, path, body, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
    });
    await assert.rejects(
      () => fetchPartnerDashboard('designer@rapqa.com', { callEngine, timeoutMs: 20 }),
      (err) => err.code === 'upstream_unavailable'
    );
  });
});
