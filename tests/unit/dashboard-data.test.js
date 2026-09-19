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

// The prospects half (contract F) is stubbed out unless a case says otherwise,
// so the contract B cases never touch Supabase.
function handlerWith(deps) {
  return createHandler(Object.assign({
    getPartnerId: async () => null,
    loadProspects: async () => []
  }, deps));
}

const PROSPECT = {
  id: 'p-1',
  client_name: 'Harper Project',
  project_name: 'Dining Room',
  client_email: 'harper@example.com',
  client_phone: null,
  notes: null,
  link_sent_at: null,
  link_sent_count: 0,
  created_at: '2026-09-18T10:00:00Z'
};

const COMMISSION = {
  plan_registration_id: 12345,
  purchase_date: '2026-09-09',
  customer_last_name: 'Harper',
  customer_email: 'HARPER@example.com',
  plan_number: 'QAFAKE-W005',
  plan_type: 'Plan B',
  retail_paid_cents: 304000,
  commission_cents: 30400,
  commission_status: 'Pending',
  months_coverage: 36,
  months_remaining: 36,
  plan_sent: true
};

function parse(res) {
  return JSON.parse(res.body);
}

function assertNoStore(res) {
  assert.equal(res.headers['Cache-Control'], 'no-store');
}

test('dashboard-data', async (t) => {
  await t.test('rejects anything but GET with 405 method_not_allowed', async () => {
    const handler = handlerWith({ getUser: okUser(), callEngine: engineReplying(200, ENGINE_BODY) });
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
    const handler = handlerWith({
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
    const handler = handlerWith({
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
    const handler = handlerWith({
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
      const handler = handlerWith({
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
    const handler = handlerWith({ getUser: okUser(), callEngine: engine });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), Object.assign({}, ENGINE_BODY, { linked: true, clients: [] }));
    assert.equal(res.headers['Content-Type'], 'application/json');
    assertNoStore(res);
  });

  await t.test('calls the engine with POST, the contract path, the token email and an abort signal', async () => {
    const engine = engineReplying(200, ENGINE_BODY);
    const handler = handlerWith({ getUser: okUser(), callEngine: engine });
    await handler(getEvent({ queryStringParameters: { email: 'someone-else@rapqa.com' } }));
    assert.equal(engine.calls.length, 1);
    const call = engine.calls[0];
    assert.equal(call.method, 'POST');
    assert.equal(call.path, '/api/v1/partner/dashboard');
    assert.deepEqual(call.body, { email: USER.email });
    assert.ok(call.opts && call.opts.signal instanceof AbortSignal);
  });

  await t.test('engine 404 is 200 { linked: false, clients: [] }, exactly', async () => {
    const engine = engineReplying(404, { code: 'not_found', message: 'No designer' });
    const handler = handlerWith({ getUser: okUser(), callEngine: engine });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), { linked: false, clients: [] });
    assertNoStore(res);
  });

  await t.test('engine 200 merges the partner\'s prospects into clients (contract F)', async () => {
    const partnerCalls = [];
    const prospectCalls = [];
    const engine = engineReplying(200, Object.assign({}, ENGINE_BODY, { commissions: [COMMISSION] }));
    const handler = handlerWith({
      getUser: okUser(),
      callEngine: engine,
      getPartnerId: async (userId) => { partnerCalls.push(userId); return 'partner-1'; },
      loadProspects: async (partnerId) => { prospectCalls.push(partnerId); return [PROSPECT]; }
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(partnerCalls, [USER.id]);
    assert.deepEqual(prospectCalls, ['partner-1']);
    const body = parse(res);
    assert.equal(body.linked, true);
    assert.deepEqual(body.commissions, [COMMISSION]);
    assert.deepEqual(body.clients, [{
      id: 'p-1',
      client_name: 'Harper Project',
      project_name: 'Dining Room',
      client_email: 'harper@example.com',
      status: 'active',
      link_sent_at: null,
      link_sent_count: 0,
      plan_number: 'QAFAKE-W005',
      months_remaining: 36,
      plan_registration_id: 12345
    }]);
    assertNoStore(res);
  });

  await t.test('engine 404 still returns the prospects as clients (added / link_sent)', async () => {
    const sent = Object.assign({}, PROSPECT, {
      id: 'p-2', client_email: 'b@example.com', link_sent_at: '2026-09-18T12:00:00Z', link_sent_count: 1
    });
    const handler = handlerWith({
      getUser: okUser(),
      callEngine: engineReplying(404, { code: 'not_found', message: 'No designer' }),
      getPartnerId: async () => 'partner-1',
      loadProspects: async () => [sent, PROSPECT]
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), {
      linked: false,
      clients: [
        {
          id: 'p-2',
          client_name: 'Harper Project',
          project_name: 'Dining Room',
          client_email: 'b@example.com',
          status: 'link_sent',
          link_sent_at: '2026-09-18T12:00:00Z',
          link_sent_count: 1,
          plan_number: null,
          months_remaining: null,
          plan_registration_id: null
        },
        {
          id: 'p-1',
          client_name: 'Harper Project',
          project_name: 'Dining Room',
          client_email: 'harper@example.com',
          status: 'added',
          link_sent_at: null,
          link_sent_count: 0,
          plan_number: null,
          months_remaining: null,
          plan_registration_id: null
        }
      ]
    });
  });

  await t.test('no partners row: prospects are not looked up, clients come from the sales alone', async () => {
    let prospectCalls = 0;
    const handler = handlerWith({
      getUser: okUser(),
      callEngine: engineReplying(200, Object.assign({}, ENGINE_BODY, { commissions: [COMMISSION] })),
      getPartnerId: async () => null,
      loadProspects: async () => { prospectCalls++; return [PROSPECT]; }
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.equal(prospectCalls, 0);
    const body = parse(res);
    assert.equal(body.clients.length, 1);
    assert.equal(body.clients[0].id, null);
    assert.equal(body.clients[0].client_name, 'Harper');
  });

  await t.test('a prospects lookup failure does not break the sales: 200 with clients [] and a log line', async (tt) => {
    const err = tt.mock.method(console, 'error', () => {});
    const handler = handlerWith({
      getUser: okUser(),
      callEngine: engineReplying(200, Object.assign({}, ENGINE_BODY, { commissions: [COMMISSION] })),
      getPartnerId: async () => 'partner-1',
      loadProspects: async () => { throw new Error('permission denied'); }
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    const body = parse(res);
    assert.equal(body.linked, true);
    assert.deepEqual(body.commissions, [COMMISSION]);
    // The sale still shows as a client; only the prospect side is missing.
    assert.equal(body.clients.length, 1);
    assert.equal(body.clients[0].id, null);
    assert.equal(err.mock.callCount(), 1);
  });

  await t.test('a partner lookup failure is treated the same: 200, prospects skipped', async (tt) => {
    const err = tt.mock.method(console, 'error', () => {});
    let prospectCalls = 0;
    const handler = handlerWith({
      getUser: okUser(),
      callEngine: engineReplying(404, { code: 'not_found', message: 'No designer' }),
      getPartnerId: async () => { throw new Error('boom'); },
      loadProspects: async () => { prospectCalls++; return [PROSPECT]; }
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), { linked: false, clients: [] });
    assert.equal(prospectCalls, 0);
    assert.equal(err.mock.callCount(), 1);
  });

  await t.test('engine 502 carries no clients', async (tt) => {
    tt.mock.method(console, 'warn', () => {});
    const handler = handlerWith({
      getUser: okUser(),
      callEngine: engineReplying(500, { code: 'internal_error', message: 'boom' }),
      getPartnerId: async () => 'partner-1',
      loadProspects: async () => [PROSPECT]
    });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 502);
    assert.deepEqual(parse(res), {
      code: 'upstream_unavailable',
      message: 'Sales data is temporarily unavailable. Please try again.'
    });
  });

  await t.test('engine 401 is 502 upstream_unavailable and logs an ops error once', async (tt) => {
    const err = tt.mock.method(console, 'error', () => {});
    const engine = engineReplying(401, { code: 'hmac_invalid', message: 'nope' });
    const handler = handlerWith({ getUser: okUser(), callEngine: engine });
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
    const handler = handlerWith({
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
    const handler = handlerWith({ getUser: okUser(), callEngine: engineReplying(200, null) });
    const res = await handler(getEvent());
    assert.equal(res.statusCode, 502);
    assert.equal(parse(res).code, 'upstream_unavailable');
  });

  await t.test('engine unreachable (callEngine rejects) is 502', async (tt) => {
    tt.mock.method(console, 'warn', () => {});
    const handler = handlerWith({
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
    const handler = handlerWith({
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
