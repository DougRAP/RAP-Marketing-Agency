// Unit tests for netlify/functions/cart-checkout.js, the CHECKOUT_OPEN gate
// of storefront-checkout-plan.md P0.1.
//
// Node's built-in runner: `node --test tests/unit/cart-checkout.test.js`.
// Nothing here touches the network: the engine call and supabase are
// injected through createHandler(deps). CHECKOUT_OPEN is saved and restored
// around every test so the suite leaves process.env as it found it.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../../designer-plan-site/netlify/functions/cart-checkout');

const VALID_BODY = {
  plan_id: 300000,
  sales_order_number: 'SO-UNIT-1',
  amount_cents: 24900,
  coverage_retail_cents: 830000,
  customer: { name: 'Harper Unit', email: 'Harper.Unit@rapqa.com' },
  consent_text: 'I agree.'
};

const ENGINE_OK = {
  payment_intent_id: 'pi_unit_1',
  client_secret: 'pi_unit_1_secret_x',
  amount_cents: 24900,
  currency: 'usd',
  designer_attributed: false
};

function postEvent(body, overrides) {
  return Object.assign({
    httpMethod: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }, overrides || {});
}

function parse(res) {
  return JSON.parse(res.body);
}

function engineReplying(status, json) {
  const fn = async (method, path, payload) => {
    fn.calls.push({ method, path, payload });
    return { status, json, raw: json == null ? '' : JSON.stringify(json) };
  };
  fn.calls = [];
  return fn;
}

/** Records every from() call; upsert().select().single() yields a lead row. */
function recordingSupabase() {
  const calls = [];
  return {
    calls,
    from(table) {
      const call = { table, ops: [] };
      calls.push(call);
      const chain = {
        upsert(payload, opts) { call.ops.push(['upsert', payload, opts]); return chain; },
        insert(payload) { call.ops.push(['insert', payload]); return Promise.resolve({ data: null, error: null }); },
        select(cols) { call.ops.push(['select', cols]); return chain; },
        async single() { call.ops.push(['single']); return { data: { id: 'lead-1' }, error: null }; }
      };
      return chain;
    }
  };
}

function setup(opts) {
  const o = opts || {};
  const callEngine = o.engine || engineReplying(200, ENGINE_OK);
  const supabase = recordingSupabase();
  const handler = createHandler({ callEngine, supabase });
  return { handler, callEngine, supabase };
}

async function withCheckoutOpen(value, fn) {
  const saved = process.env.CHECKOUT_OPEN;
  try {
    if (value === undefined) delete process.env.CHECKOUT_OPEN; else process.env.CHECKOUT_OPEN = value;
    await fn();
  } finally {
    if (saved === undefined) delete process.env.CHECKOUT_OPEN; else process.env.CHECKOUT_OPEN = saved;
  }
}

function assertClosed(res) {
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Content-Type'], 'application/json');
  const body = parse(res);
  assert.equal(body.code, 'checkout_closed');
  assert.equal(body.message, 'Checkout is not open yet. Your items are saved in your cart.');
}

test('cart-checkout', async (t) => {
  for (const value of [undefined, 'false', '1', 'TRUE ', '']) {
    await t.test(`503 checkout_closed with a valid body when CHECKOUT_OPEN is ${JSON.stringify(value)}`, async () => {
      await withCheckoutOpen(value, async () => {
        const { handler, callEngine, supabase } = setup();
        const res = await handler(postEvent(VALID_BODY));
        assertClosed(res);
        assert.equal(callEngine.calls.length, 0);
        assert.equal(supabase.calls.length, 0);
      });
    });
  }

  await t.test('503 checkout_closed, not the honeypot 200, when closed and hp is set', async () => {
    await withCheckoutOpen(undefined, async () => {
      const { handler, callEngine } = setup();
      const res = await handler(postEvent({ hp: 'x' }));
      assertClosed(res);
      assert.equal(callEngine.calls.length, 0);
    });
  });

  await t.test('503 checkout_closed, not bad_json, when closed and the body is malformed', async () => {
    await withCheckoutOpen(undefined, async () => {
      const { handler, callEngine } = setup();
      const res = await handler(postEvent('{not json'));
      assertClosed(res);
      assert.equal(callEngine.calls.length, 0);
    });
  });

  await t.test('405 method_not_allowed for GET even when closed', async () => {
    await withCheckoutOpen(undefined, async () => {
      const { handler } = setup();
      const res = await handler(postEvent(VALID_BODY, { httpMethod: 'GET' }));
      assert.equal(res.statusCode, 405);
      assert.equal(parse(res).code, 'method_not_allowed');
    });
  });

  await t.test('open: 400 validation_failed for an empty body', async () => {
    await withCheckoutOpen('true', async () => {
      const { handler, callEngine } = setup();
      const res = await handler(postEvent({}));
      assert.equal(res.statusCode, 400);
      assert.equal(parse(res).code, 'validation_failed');
      assert.equal(callEngine.calls.length, 0);
    });
  });

  await t.test('open: 200 honeypot reply when hp is set', async () => {
    await withCheckoutOpen('true', async () => {
      const { handler, callEngine } = setup();
      const res = await handler(postEvent({ hp: 'x' }));
      assert.equal(res.statusCode, 200);
      assert.deepEqual(parse(res), { ok: true, honeypot: true });
      assert.equal(callEngine.calls.length, 0);
    });
  });

  await t.test('open: a valid body calls the engine once and passes its 200 through', async () => {
    await withCheckoutOpen('true', async () => {
      const { handler, callEngine, supabase } = setup();
      const res = await handler(postEvent(VALID_BODY));
      assert.equal(res.statusCode, 200);
      assert.deepEqual(parse(res), ENGINE_OK);
      assert.equal(callEngine.calls.length, 1);
      const call = callEngine.calls[0];
      assert.equal(call.method, 'POST');
      assert.equal(call.path, '/api/v1/checkout');
      assert.equal(call.payload.plan_id, 300000);
      assert.equal(call.payload.amount_cents, 24900);
      assert.equal(call.payload.customer.email, 'harper.unit@rapqa.com');

      // The lead_events log runs best-effort after the reply, on the injected client.
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(supabase.calls.map((c) => c.table), ['leads', 'lead_events']);
    });
  });

  await t.test('CHECKOUT_OPEN is read per request, not at load time', async () => {
    await withCheckoutOpen(undefined, async () => {
      const { handler } = setup();
      const closed = await handler(postEvent({}));
      assert.equal(closed.statusCode, 503);
      process.env.CHECKOUT_OPEN = 'true';
      const open = await handler(postEvent({}));
      assert.equal(open.statusCode, 400);
      assert.equal(parse(open).code, 'validation_failed');
    });
  });
});
