// Unit tests for netlify/functions/client-send-link.js (contract F).
//
// Node's built-in runner: `node --test tests/unit/client-send-link.test.js`.
// Nothing here touches the network: supabase, the engine call and the Resend
// wrapper are injected through createHandler(deps).

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../../designer-plan-site/netlify/functions/client-send-link');
const { makeFakeSupabase, eqFilters } = require('./helpers/fake-supabase');

const NOW = new Date('2026-09-18T12:00:00.000Z');
const USER = { id: 'user-1', email: 'designer@rapqa.com' };
const PARTNER = { id: 'partner-1', studio_name: 'Harper Studio' };
const CLIENT_ID = '2f1c4a2e-6b0c-4d7c-9a1a-1c2d3e4f5a6b';

function clientRow(overrides) {
  return Object.assign({
    id: CLIENT_ID,
    client_name: 'Harper <Project>',
    client_email: 'harper@rapqa.com',
    link_sent_at: null,
    link_sent_count: 0
  }, overrides || {});
}

function minutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}

function postEvent(body, overrides) {
  return Object.assign({
    httpMethod: 'POST',
    headers: { authorization: 'Bearer jwt-abc' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }, overrides || {});
}

function parse(res) {
  return JSON.parse(res.body);
}

function engineReplying(status, json) {
  const fn = async (email, opts) => {
    fn.calls.push({ email, opts });
    return { status, json, raw: json == null ? '' : JSON.stringify(json) };
  };
  fn.calls = [];
  return fn;
}

function engineThrowing() {
  const fn = async (email, opts) => {
    fn.calls.push({ email, opts });
    const err = new Error('engine down');
    err.code = 'upstream_unavailable';
    throw err;
  };
  fn.calls = [];
  return fn;
}

function fakeResend(opts) {
  const o = opts || {};
  const resend = {
    sends: [],
    isConfigured: () => o.configured !== false,
    async sendEmail(message) {
      resend.sends.push(message);
      if (o.fail) {
        const err = new Error('resend said no');
        err.code = 'email_failed';
        err.status = 422;
        throw err;
      }
      return { id: 'resend-msg-1' };
    }
  };
  return resend;
}

const LINKED = { status: 200, body: { dealer_id: 421, affiliated_id: 'AB-RPFG', dealer_name: 'Adrian Barres' } };

function setup(opts) {
  const o = opts || {};
  const supabase = makeFakeSupabase({
    user: 'user' in o ? o.user : USER,
    partner: 'partner' in o ? o.partner : PARTNER,
    client: 'client' in o ? o.client : clientRow(),
    updateResult: o.updateResult || { data: null, error: { message: 'no updateResult' } }
  });
  const fetchPartnerDashboard = o.engine || engineReplying(LINKED.status, LINKED.body);
  const resend = o.resend || fakeResend();
  const handler = createHandler({ supabase, now: () => NOW, fetchPartnerDashboard, resend });
  return { handler, supabase, fetchPartnerDashboard, resend };
}

test('client-send-link', async (t) => {
  await t.test('405 method_not_allowed for GET', async () => {
    const { handler } = setup();
    const res = await handler(postEvent({ client_id: CLIENT_ID }, { httpMethod: 'GET' }));
    assert.equal(res.statusCode, 405);
    assert.equal(parse(res).code, 'method_not_allowed');
  });

  await t.test('401 missing_bearer_token without an Authorization header', async () => {
    const { handler } = setup();
    const res = await handler(postEvent({ client_id: CLIENT_ID }, { headers: {} }));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'missing_bearer_token');
  });

  await t.test('401 invalid_token for a bad JWT', async () => {
    const { handler, fetchPartnerDashboard } = setup();
    const res = await handler(postEvent({ client_id: CLIENT_ID }, { headers: { authorization: 'Bearer bad' } }));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'invalid_token');
    assert.equal(fetchPartnerDashboard.calls.length, 0);
  });

  await t.test('400 bad_json when the body is not JSON', async () => {
    const { handler } = setup();
    const res = await handler(postEvent('nope'));
    assert.equal(res.statusCode, 400);
    assert.equal(parse(res).code, 'bad_json');
  });

  await t.test('400 validation_failed when client_id is not a UUID', async () => {
    const { handler, supabase } = setup();
    const res = await handler(postEvent({ client_id: 'abc' }));
    assert.equal(res.statusCode, 400);
    const body = parse(res);
    assert.equal(body.code, 'validation_failed');
    assert.match(body.message, /client_id/);
    assert.equal(supabase.calls.length, 0);
  });

  await t.test('401 no_partner_row when the user has no partners row', async () => {
    const { handler, supabase } = setup({ partner: null });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'no_partner_row');
    assert.equal(supabase.callsTo('partner_clients').length, 0);
  });

  await t.test('404 not_found when no row matches id AND partner_id', async () => {
    const { handler, supabase, fetchPartnerDashboard } = setup({ client: null });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 404);
    assert.equal(parse(res).code, 'not_found');

    const lookup = supabase.callsTo('partner_clients')[0];
    assert.ok(lookup, 'partner_clients is queried');
    assert.deepEqual(eqFilters(lookup), { id: CLIENT_ID, partner_id: PARTNER.id });
    assert.equal(fetchPartnerDashboard.calls.length, 0);
  });

  await t.test('429 rate_limited when a link went out 5 minutes ago; engine and resend untouched', async () => {
    const { handler, supabase, fetchPartnerDashboard, resend } = setup({
      client: clientRow({ link_sent_at: minutesAgo(5), link_sent_count: 1 })
    });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 429);
    const body = parse(res);
    assert.equal(body.code, 'rate_limited');
    assert.equal(body.message, 'A link was sent to this client in the last 10 minutes.');
    assert.equal(fetchPartnerDashboard.calls.length, 0);
    assert.equal(resend.sends.length, 0);
    assert.equal(supabase.calls.filter((c) => c.update !== undefined).length, 0);
  });

  await t.test('a link sent 11 minutes ago no longer blocks', async () => {
    const updated = clientRow({ link_sent_at: NOW.toISOString(), link_sent_count: 2 });
    const { handler, resend } = setup({
      client: clientRow({ link_sent_at: minutesAgo(11), link_sent_count: 1 }),
      updateResult: { data: updated, error: null }
    });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 200);
    assert.equal(resend.sends.length, 1);
  });

  await t.test('409 not_linked when the engine answers 404; nothing sent, nothing updated', async () => {
    const { handler, supabase, resend } = setup({
      engine: engineReplying(404, { code: 'not_found', message: 'no designer' })
    });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 409);
    const body = parse(res);
    assert.equal(body.code, 'not_linked');
    assert.equal(body.message, 'Your account is not linked to a sales account yet.');
    assert.equal(resend.sends.length, 0);
    assert.equal(supabase.calls.filter((c) => c.update !== undefined).length, 0);
  });

  for (const [label, engine] of [
    ['throws', engineThrowing()],
    ['answers 500', engineReplying(500, { code: 'internal_error', message: 'x' })],
    ['answers 401', engineReplying(401, { code: 'invalid_signature', message: 'x' })]
  ]) {
    await t.test(`502 upstream_unavailable when the engine ${label}`, async () => {
      const { handler, resend } = setup({ engine });
      const res = await handler(postEvent({ client_id: CLIENT_ID }));
      assert.equal(res.statusCode, 502);
      assert.equal(parse(res).code, 'upstream_unavailable');
      assert.equal(resend.sends.length, 0);
      assert.equal(engine.calls[0].email, USER.email, 'engine is asked with the JWT email');
    });
  }

  await t.test('503 email_not_configured when there is no Resend key; nothing sent, nothing updated', async () => {
    const { handler, supabase, resend } = setup({ resend: fakeResend({ configured: false }) });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 503);
    assert.equal(parse(res).code, 'email_not_configured');
    assert.equal(resend.sends.length, 0);
    assert.equal(supabase.calls.filter((c) => c.update !== undefined).length, 0);
  });

  await t.test('502 email_failed when Resend rejects; the row is not updated', async () => {
    const { handler, supabase } = setup({ resend: fakeResend({ fail: true }) });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 502);
    assert.equal(parse(res).code, 'email_failed');
    assert.equal(supabase.calls.filter((c) => c.update !== undefined).length, 0);
  });

  await t.test('500 update_failed when the row update fails after the email went out', async () => {
    const { handler, resend } = setup({ updateResult: { data: null, error: { message: 'db down' } } });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 500);
    assert.equal(parse(res).code, 'update_failed');
    assert.equal(resend.sends.length, 1);
  });

  await t.test('200: sends to the client, reply-to the designer, link with the affiliated id, then stamps the row', async () => {
    const updated = clientRow({ link_sent_at: NOW.toISOString(), link_sent_count: 3 });
    const { handler, supabase, resend, fetchPartnerDashboard } = setup({
      client: clientRow({ link_sent_at: minutesAgo(60), link_sent_count: 2 }),
      updateResult: { data: updated, error: null }
    });
    const res = await handler(postEvent({ client_id: CLIENT_ID }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), updated);

    assert.equal(fetchPartnerDashboard.calls.length, 1);
    assert.equal(fetchPartnerDashboard.calls[0].email, USER.email);

    assert.equal(resend.sends.length, 1);
    const msg = resend.sends[0];
    assert.equal(msg.to, 'harper@rapqa.com');
    assert.equal(msg.replyTo, USER.email);
    assert.match(msg.subject, /Harper Studio/);
    assert.match(msg.text, /\/plans\?ref=AB-RPFG/);
    assert.match(msg.html, /href="https:\/\/thedesignerplan\.com\/plans\?ref=AB-RPFG"/);
    assert.match(msg.text, /Harper <Project>/, 'text keeps the raw name');
    assert.match(msg.html, /Harper &lt;Project&gt;/, 'html escapes the client name');
    assert.doesNotMatch(msg.html, /Harper <Project>/);

    const update = supabase.calls.find((c) => c.update !== undefined);
    assert.ok(update, 'row is updated');
    assert.equal(update.table, 'partner_clients');
    assert.deepEqual(update.update, { link_sent_at: NOW.toISOString(), link_sent_count: 3 });
    assert.deepEqual(eqFilters(update), { id: CLIENT_ID });
  });

  await t.test('designer name falls back to dealer_name, then the email', async () => {
    const updated = clientRow({ link_sent_at: NOW.toISOString(), link_sent_count: 1 });
    const viaDealer = setup({
      partner: { id: 'partner-1', studio_name: null },
      updateResult: { data: updated, error: null }
    });
    await viaDealer.handler(postEvent({ client_id: CLIENT_ID }));
    assert.match(viaDealer.resend.sends[0].subject, /Adrian Barres/);

    const viaEmail = setup({
      partner: { id: 'partner-1', studio_name: '' },
      engine: engineReplying(200, { dealer_id: 421, affiliated_id: 'AB-RPFG' }),
      updateResult: { data: updated, error: null }
    });
    await viaEmail.handler(postEvent({ client_id: CLIENT_ID }));
    assert.match(viaEmail.resend.sends[0].subject, /designer@rapqa\.com/);
  });
});
