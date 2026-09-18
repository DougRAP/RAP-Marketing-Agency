// Unit tests for netlify/functions/client-add.js (contract F).
//
// Node's built-in runner: `node --test tests/unit/client-add.test.js`.
// Nothing here touches the network: the supabase client is injected through
// createHandler(deps).

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHandler } = require('../../designer-plan-site/netlify/functions/client-add');
const { makeFakeSupabase } = require('./helpers/fake-supabase');

const USER = { id: 'user-1', email: 'designer@rapqa.com' };
const PARTNER = { id: 'partner-1', studio_name: 'Harper Studio' };

const INSERTED_ROW = {
  id: '2f1c4a2e-6b0c-4d7c-9a1a-1c2d3e4f5a6b',
  client_name: 'Harper Project',
  project_name: 'Dining Room',
  client_email: 'harper@rapqa.com',
  client_phone: null,
  notes: null,
  link_sent_at: null,
  link_sent_count: 0,
  created_at: '2026-09-18T12:00:00.000Z',
  updated_at: '2026-09-18T12:00:00.000Z'
};

function postEvent(body, overrides) {
  return Object.assign({
    httpMethod: 'POST',
    headers: { authorization: 'Bearer jwt-abc' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  }, overrides || {});
}

function validBody(overrides) {
  return Object.assign({
    client_name: 'Harper Project',
    project_name: 'Dining Room',
    client_email: 'harper@rapqa.com'
  }, overrides || {});
}

function parse(res) {
  return JSON.parse(res.body);
}

function handlerWith(fakeOpts) {
  const supabase = makeFakeSupabase(Object.assign({ user: USER, partner: PARTNER }, fakeOpts || {}));
  const handler = createHandler({ supabase });
  return { handler, supabase };
}

test('client-add', async (t) => {
  await t.test('405 method_not_allowed for GET', async () => {
    const { handler } = handlerWith();
    const res = await handler(postEvent(validBody(), { httpMethod: 'GET' }));
    assert.equal(res.statusCode, 405);
    assert.equal(parse(res).code, 'method_not_allowed');
  });

  await t.test('401 missing_bearer_token without an Authorization header', async () => {
    const { handler, supabase } = handlerWith();
    const res = await handler(postEvent(validBody(), { headers: {} }));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'missing_bearer_token');
    assert.equal(supabase.calls.length, 0);
  });

  await t.test('401 invalid_token when the JWT does not resolve to a user', async () => {
    const { handler, supabase } = handlerWith();
    const res = await handler(postEvent(validBody(), { headers: { authorization: 'Bearer bad' } }));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'invalid_token');
    assert.equal(supabase.calls.length, 0);
  });

  await t.test('500 server_misconfigured when there is no supabase client', async () => {
    const handler = createHandler({ supabase: null });
    const res = await handler(postEvent(validBody()));
    assert.equal(res.statusCode, 500);
    assert.equal(parse(res).code, 'server_misconfigured');
  });

  await t.test('400 bad_json when the body is not JSON', async () => {
    const { handler } = handlerWith();
    const res = await handler(postEvent('{not json'));
    assert.equal(res.statusCode, 400);
    assert.equal(parse(res).code, 'bad_json');
  });

  await t.test('honeypot: 200 { ok, honeypot } and no table is read or written', async () => {
    const { handler, supabase } = handlerWith();
    const res = await handler(postEvent(validBody({ hp: 'bot', client_name: '' })));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(parse(res), { ok: true, honeypot: true });
    assert.equal(supabase.calls.length, 0);
  });

  await t.test('400 validation_failed names client_name when it is missing', async () => {
    const { handler, supabase } = handlerWith();
    const res = await handler(postEvent(validBody({ client_name: '   ' })));
    assert.equal(res.statusCode, 400);
    const body = parse(res);
    assert.equal(body.code, 'validation_failed');
    assert.match(body.message, /client_name/);
    assert.equal(supabase.calls.length, 0);
  });

  await t.test('400 validation_failed names client_email when it is malformed', async () => {
    const { handler } = handlerWith();
    const res = await handler(postEvent(validBody({ client_email: 'not-an-email' })));
    assert.equal(res.statusCode, 400);
    const body = parse(res);
    assert.equal(body.code, 'validation_failed');
    assert.match(body.message, /client_email/);
  });

  await t.test('400 validation_failed names notes when longer than 2000 characters', async () => {
    const { handler } = handlerWith();
    const res = await handler(postEvent(validBody({ notes: 'x'.repeat(2001) })));
    assert.equal(res.statusCode, 400);
    const body = parse(res);
    assert.equal(body.code, 'validation_failed');
    assert.match(body.message, /notes/);
  });

  await t.test('401 no_partner_row when the user has no partners row', async () => {
    const { handler, supabase } = handlerWith({ partner: null });
    const res = await handler(postEvent(validBody()));
    assert.equal(res.statusCode, 401);
    assert.equal(parse(res).code, 'no_partner_row');
    assert.equal(supabase.callsTo('partner_clients').length, 0);
  });

  await t.test('409 duplicate_client when the insert hits the unique constraint', async () => {
    const { handler } = handlerWith({
      insertResult: { data: null, error: { code: '23505', message: 'duplicate key value' } }
    });
    const res = await handler(postEvent(validBody()));
    assert.equal(res.statusCode, 409);
    const body = parse(res);
    assert.equal(body.code, 'duplicate_client');
    assert.equal(body.message, "That client's email is already on your list.");
  });

  await t.test('500 insert_failed on any other insert error', async () => {
    const { handler } = handlerWith({
      insertResult: { data: null, error: { code: '42P01', message: 'boom' } }
    });
    const res = await handler(postEvent(validBody()));
    assert.equal(res.statusCode, 500);
    assert.equal(parse(res).code, 'insert_failed');
  });

  await t.test('201 with the inserted row; email lowercased and trimmed, empty optionals null, leads untouched', async () => {
    const { handler, supabase } = handlerWith({ insertResult: { data: INSERTED_ROW, error: null } });
    const res = await handler(postEvent({
      client_name: '  Harper Project ',
      project_name: 'Dining Room',
      client_email: '  Harper@RapQA.com ',
      client_phone: '',
      notes: '   '
    }));
    assert.equal(res.statusCode, 201);
    assert.deepEqual(parse(res), INSERTED_ROW);

    const partnerLookup = supabase.callsTo('partners')[0];
    assert.ok(partnerLookup, 'partner row is looked up');
    assert.deepEqual(partnerLookup.ops.find((op) => op[0] === 'eq'), ['eq', 'auth_user_id', USER.id]);

    const insert = supabase.callsTo('partner_clients')[0];
    assert.ok(insert && insert.insert, 'partner_clients insert happened');
    assert.deepEqual(insert.insert, {
      partner_id: PARTNER.id,
      client_name: 'Harper Project',
      project_name: 'Dining Room',
      client_email: 'harper@rapqa.com',
      client_phone: null,
      notes: null
    });
    const selectOp = insert.ops.find((op) => op[0] === 'select');
    assert.ok(selectOp && /link_sent_count/.test(selectOp[1]), 'insert selects the row back');

    assert.equal(supabase.callsTo('leads').length, 0, 'prospects never go into leads');
    assert.equal(supabase.callsTo('lead_events').length, 0);
  });
});
