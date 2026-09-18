// Unit tests for netlify/functions/dashboard-data.js (contract B) and the
// AbortSignal pass-through added to _hmac.callEngine.
//
// Node's built-in runner: `npm run test:unit`. Nothing here touches the
// network: supabase and the engine are injected through createHandler(deps),
// and fetch is mocked for the _hmac cases.

const test = require('node:test');
const assert = require('node:assert/strict');

// _hmac.js reads its env at require time, so it has to be in place first.
process.env.HMAC_KEY_ID = 'unit-test-key';
process.env.HMAC_SECRET = 'unit-test-secret';
process.env.ENGINE_BASE_URL = 'http://engine.test';
process.env.SUPABASE_URL = 'http://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service-role';

const { createHandler } = require('../../designer-plan-site/netlify/functions/dashboard-data');
const hmac = require('../../designer-plan-site/netlify/functions/_hmac');

const USER = { id: 'user-1', email: 'designer@rapqa.com' };

const ENGINE_BODY = {
  dealer_id: 421,
  affiliated_id: 'AB-RPFG',
  dealer_name: 'Adrian Barres',
  stripe_status: 'NOT_CONNECTED',
  tracked_cents: 178840,
  pending_cents: 93600,
  payable_cents: 0,
  paid_cents: 85240,
  total_sales: 3,
  commissions: []
};

function getEvent(overrides) {
  return Object.assign({
    httpMethod: 'GET',
    headers: { authorization: 'Bearer jwt-abc' },
    queryStringParameters: null,
    body: null
  }, overrides || {});
}

function okUser() {
  return async () => ({ data: { user: USER }, error: null });
}

function engineReplying(status, json) {
  const calls = [];
  const fn = async (method, path, body, opts) => {
    calls.push({ method, path, body, opts });
    return { status, json, raw: json == null ? '' : JSON.stringify(json) };
  };
  fn.calls = calls;
  return fn;
}

function parse(res) {
  return JSON.parse(res.body);
}

function assertNoStore(res) {
  assert.equal(res.headers['Cache-Control'], 'no-store');
}

test('dashboard-data', async (t) => {
  await t.test('rejects anything but GET with 405 method_not_allowed', async () => {
    const handler = createHandler({ getUser: okUser(), callEngine: engineReplying(200, ENGINE_BODY) });
    const res = await handler(getEvent({ httpMethod: 'POST' }));
    assert.equal(res.statusCode, 405);
    assert.deepEqual(parse(res), {
      code: 'method_not_allowed',
      message: 'Use GET.'
    });
    assertNoStore(res);
  });

  await t.test('401 missing_bearer_token without an Authorization header, nothing called', async () => {
    let userCalls = 0;
    const engine = engineReplying(200, ENGINE_BODY);
    const handler = createHandler({
      getUser: async () => { userCalls++; return { data: { user: USER }, error: null }; },
      callEngine: engine
    });
    const res = await handler(getEvent({ headers: {} }));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'missing_bearer_token');
    assert.equal(userCalls, 0);
    assert.equal(engine.calls.length, 0);
    assertNoStore(res);
  });

  await t.test('401 invalid_token when the JWT does not resolve to a user', async () => {
    const engine = engineReplying(200, ENGINE_BODY);
    const handler = createHandler({
      getUser: async () => ({ data: { user: null }, error: { message: 'bad jwt' } }),
      callEngine: engine
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'invalid_token');
    assert.equal(engine.calls.length, 0);
    assertNoStore(res);
  });

  await t.test('401 invalid_token when the user has no email', async () => {
    const engine = engineReplying(200, ENGINE_BODY);
    const handler = createHandler({
      getUser: async () => ({ data: { user: { id: 'u' } }, error: null }),
      callEngine: engine
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'invalid_token');
    assert.equal(engine.calls.length, 0);
  });

  await t.test('500 server_misconfigured when a required env var is missing', async () => {
    const saved = process.env.ENGINE_BASE_URL;
    delete process.env.ENGINE_BASE_URL;
    try {
      let userCalls = 0;
      const handler = createHandler({
        getUser: async () => { userCalls++; return { data: { user: USER }, error: null }; },
        callEngine: engineReplying(200, ENGINE_BODY)
      });
      const res = await handler(getEvent());
      assert.equal(res.statusCode, 500);
      assert.equal(parse(res).code, 'server_misconfigured');
      assert.equal(userCalls, 0);
      assertNoStore(res);
    } finally {
      process.env.ENGINE_BASE_URL = saved;
    }
  });

  await t.test('engine 200 passes the body through with linked:true', async () => {
    const engine = engineReplying(200, Object.assign({}, ENGINE_BODY, { linked: false }));
    const handler = createHandler({ getUser: okUser(), callEngine: engine });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), Object.assign({}, ENGINE_BODY, { linked: true }));
    assert.equal(res.headers['Content-Type'], 'application/json');
    assertNoStore(res);
  });

  await t.test('calls the engine with POST, the contract path, the token email and an abort signal', async () => {
    const engine = engineReplying(200, ENGINE_BODY);
    const handler = createHandler({ getUser: okUser(), callEngine: engine });
    await handler(getEvent({ queryStringParameters: { email: 'someone-else@rapqa.com' } }));
    assert.equal(engine.calls.length, 1);
    const call = engine.calls[0];
    assert.equal(call.method, 'POST');
    assert.equal(call.path, '/api/v1/partner/dashboard');
    assert.deepEqual(call.body, { email: USER.email });
    assert.ok(call.opts && call.opts.signal instanceof AbortSignal);
  });

  await t.test('engine 404 is 200 { linked: false }, exactly', async () => {
    const engine = engineReplying(404, { code: 'not_found', message: 'No designer' });
    const handler = createHandler({ getUser: okUser(), callEngine: engine });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), { linked: false });
    assertNoStore(res);
  });

  await t.test('engine 401 is 502 upstream_unavailable and logs an ops error once', async (tt) => {
    const err = tt.mock.method(console, 'error', () => {});
    const engine = engineReplying(401, { code: 'hmac_invalid', message: 'nope' });
    const handler = createHandler({ getUser: okUser(), callEngine: engine });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 502);
    assert.deepEqual(parse(res), {
      code: 'upstream_unavailable',
      message: 'Sales data is temporarily unavailable. Please try again.'
    });
    assert.equal(err.mock.callCount(), 1);
    assertNoStore(res);
  });

  await t.test('engine 500 is 502 upstream_unavailable', async (tt) => {
    tt.mock.method(console, 'warn', () => {});
    const handler = createHandler({
      getUser: okUser(),
      callEngine: engineReplying(500, { code: 'internal_error', message: 'boom' })
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 502);
    assert.equal(parse(res).code, 'upstream_unavailable');
    assertNoStore(res);
  });

  await t.test('engine 200 with an unparseable body is 502', async (tt) => {
    tt.mock.method(console, 'warn', () => {});
    const handler = createHandler({ getUser: okUser(), callEngine: engineReplying(200, null) });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 502);
    assert.equal(parse(res).code, 'upstream_unavailable');
  });

  await t.test('engine unreachable (callEngine rejects) is 502', async (tt) => {
    tt.mock.method(console, 'warn', () => {});
    const handler = createHandler({
      getUser: okUser(),
      callEngine: async () => { throw new TypeError('fetch failed'); }
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 502);
    assert.equal(parse(res).code, 'upstream_unavailable');
    assertNoStore(res);
  });

  await t.test('engine timeout aborts the call and is 502', async (tt) => {
    tt.mock.method(console, 'warn', () => {});
    const handler = createHandler({
      getUser: okUser(),
      timeoutMs: 20,
      callEngine: (method, path, body, opts) => new Promise((resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(opts.signal.reason));
      })
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 502);
    assert.equal(parse(res).code, 'upstream_unavailable');
    assertNoStore(res);
  });
});

test('_hmac.callEngine signal', async (t) => {
  await t.test('forwards opts.signal to fetch as init.signal', async (tt) => {
    const fetchMock = tt.mock.method(globalThis, 'fetch', async () => ({
      status: 200,
      text: async () => '{}'
    }));
    const controller = new AbortController();
    const res = await hmac.callEngine('POST', '/api/v1/partner/dashboard', { email: 'a@b.co' }, {
      signal: controller.signal
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json, {});
    const init = fetchMock.mock.calls[0].arguments[1];
    assert.equal(init.signal, controller.signal);
  });

  await t.test('sends no signal when opts are omitted', async (tt) => {
    const fetchMock = tt.mock.method(globalThis, 'fetch', async () => ({
      status: 200,
      text: async () => '{}'
    }));
    await hmac.callEngine('GET', '/api/v1/ping');
    const init = fetchMock.mock.calls[0].arguments[1];
    assert.equal(init.signal, undefined);
  });

  await t.test('computeSignature stays byte-for-byte stable (regression guard)', () => {
    const sig = hmac.computeSignature(
      'POST',
      '/api/v1/partner/dashboard',
      '{"email":"a@b.co"}',
      '2026-09-18T00:00:00.000Z',
      'unit-test-secret'
    );
    assert.equal(sig, '2547d671948b1170d12dda6181cb30500ba217bc5a8fb3a6f97c057c6136dc5b');
  });

  await t.test('a fetch TimeoutError propagates to the caller', async (tt) => {
    tt.mock.method(globalThis, 'fetch', async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    });
    await assert.rejects(
      hmac.callEngine('POST', '/api/v1/partner/dashboard', { email: 'a@b.co' }, {
        signal: AbortSignal.timeout(50)
      }),
      (e) => e.name === 'TimeoutError'
    );
  });
});
