// Unit tests for netlify/functions/_clients-merge.js: the join between the
// designer's prospects (Supabase partner_clients) and their sales (engine
// commissions), contract F of docs/dashboard-data-contract.md.
//
// Node's built-in runner: `npm run test:unit`. Pure functions, no network.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildClients, loadProspects } = require('../../designer-plan-site/netlify/functions/_clients-merge');

function prospect(overrides) {
  return Object.assign({
    id: 'p-1',
    client_name: 'Harper Project',
    project_name: 'Dining Room',
    client_email: 'harper@example.com',
    client_phone: null,
    notes: null,
    link_sent_at: null,
    link_sent_count: 0,
    created_at: '2026-09-18T10:00:00Z'
  }, overrides || {});
}

function commission(overrides) {
  return Object.assign({
    plan_registration_id: 12345,
    purchase_date: '2026-09-09',
    customer_last_name: 'Estevez',
    customer_email: 'qafake005@rapqa.com',
    plan_number: 'QAFAKE-W005',
    plan_type: 'Plan B',
    retail_paid_cents: 304000,
    commission_cents: 30400,
    commission_status: 'Pending',
    months_coverage: 36,
    months_remaining: 36,
    plan_sent: true
  }, overrides || {});
}

test('buildClients', async (t) => {
  await t.test('a prospect matched by email becomes one active row with the prospect\'s name and project', () => {
    const p = prospect({ client_email: 'harper@example.com', link_sent_at: '2026-09-18T11:00:00Z', link_sent_count: 2 });
    const c = commission({ customer_email: 'harper@example.com', customer_last_name: 'Harper' });
    const rows = buildClients([p], [c]);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      id: 'p-1',
      client_name: 'Harper Project',
      project_name: 'Dining Room',
      client_email: 'harper@example.com',
      status: 'active',
      link_sent_at: '2026-09-18T11:00:00Z',
      link_sent_count: 2,
      plan_number: 'QAFAKE-W005',
      months_remaining: 36,
      plan_registration_id: 12345
    });
  });

  await t.test('email matching is case-insensitive on both sides', () => {
    const p = prospect({ client_email: 'Harper@Example.com' });
    const c = commission({ customer_email: 'HARPER@example.COM' });
    const rows = buildClients([p], [c]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, 'p-1');
    assert.equal(rows[0].status, 'active');
    assert.equal(rows[0].client_email, 'harper@example.com');
  });

  await t.test('an unmatched prospect is added, or link_sent once link_sent_at is set', () => {
    const added = prospect({ id: 'p-added', client_email: 'a@example.com', created_at: '2026-09-18T10:00:00Z' });
    const sent = prospect({
      id: 'p-sent', client_email: 'b@example.com', link_sent_at: '2026-09-18T12:00:00Z',
      link_sent_count: 1, created_at: '2026-09-18T11:00:00Z'
    });
    const rows = buildClients([sent, added], []);
    assert.deepEqual(rows.map((r) => [r.id, r.status]), [['p-sent', 'link_sent'], ['p-added', 'added']]);
    assert.deepEqual(rows[1], {
      id: 'p-added',
      client_name: 'Harper Project',
      project_name: 'Dining Room',
      client_email: 'a@example.com',
      status: 'added',
      link_sent_at: null,
      link_sent_count: 0,
      plan_number: null,
      months_remaining: null,
      plan_registration_id: null
    });
    assert.equal(rows[0].link_sent_count, 1);
    assert.equal(rows[0].link_sent_at, '2026-09-18T12:00:00Z');
  });

  await t.test('a sale without a prospect shows under the customer\'s last name with no id', () => {
    const rows = buildClients([], [commission()]);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      id: null,
      client_name: 'Estevez',
      project_name: null,
      client_email: 'qafake005@rapqa.com',
      status: 'active',
      link_sent_at: null,
      link_sent_count: 0,
      plan_number: 'QAFAKE-W005',
      months_remaining: 36,
      plan_registration_id: 12345
    });
  });

  await t.test('months_remaining 0 is expired; absent months_remaining is active', () => {
    const rows = buildClients([], [
      commission({ plan_registration_id: 1, months_remaining: 0 }),
      commission({ plan_registration_id: 2, months_remaining: undefined })
    ]);
    assert.equal(rows[0].status, 'expired');
    assert.equal(rows[0].months_remaining, 0);
    assert.equal(rows[1].status, 'active');
    assert.equal(rows[1].months_remaining, null);
  });

  await t.test('a commission without customer_email never matches a prospect and carries a null email', () => {
    const p = prospect({ client_email: 'harper@example.com' });
    const rows = buildClients([p], [commission({ customer_email: undefined, plan_number: null })]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, null);
    assert.equal(rows[0].client_email, null);
    assert.equal(rows[0].plan_number, null);
    assert.equal(rows[1].id, 'p-1');
    assert.equal(rows[1].status, 'added');
  });

  await t.test('order is sales first (engine order), then unmatched prospects in the given order', () => {
    const matched = prospect({ id: 'p-m', client_email: 'm@example.com', created_at: '2026-09-18T13:00:00Z' });
    const newer = prospect({ id: 'p-new', client_email: 'n@example.com', created_at: '2026-09-18T12:00:00Z' });
    const older = prospect({ id: 'p-old', client_email: 'o@example.com', created_at: '2026-09-18T09:00:00Z' });
    const rows = buildClients([matched, newer, older], [
      commission({ plan_registration_id: 1, customer_email: 'x@example.com', customer_last_name: 'X' }),
      commission({ plan_registration_id: 2, customer_email: 'm@example.com' })
    ]);
    assert.deepEqual(rows.map((r) => r.plan_registration_id || r.id), [1, 2, 'p-new', 'p-old']);
  });

  await t.test('a prospect with two sales yields two rows sharing the prospect\'s id', () => {
    const p = prospect({ client_email: 'two@example.com' });
    const rows = buildClients([p], [
      commission({ plan_registration_id: 1, customer_email: 'two@example.com' }),
      commission({ plan_registration_id: 2, customer_email: 'two@example.com', months_remaining: 0 })
    ]);
    assert.deepEqual(rows.map((r) => [r.id, r.plan_registration_id, r.status]), [
      ['p-1', 1, 'active'],
      ['p-1', 2, 'expired']
    ]);
  });

  await t.test('tolerates null inputs', () => {
    assert.deepEqual(buildClients(null, null), []);
    assert.deepEqual(buildClients(undefined, []), []);
  });
});

test('loadProspects', async (t) => {
  await t.test('selects the prospect columns for the partner, newest first, and returns the rows', async () => {
    const ops = [];
    const rows = [prospect()];
    const supabase = {
      from(table) {
        ops.push(['from', table]);
        const chain = {
          select(cols) { ops.push(['select', cols]); return chain; },
          eq(col, val) { ops.push(['eq', col, val]); return chain; },
          order(col, opts) { ops.push(['order', col, opts]); return Promise.resolve({ data: rows, error: null }); }
        };
        return chain;
      }
    };
    const out = await loadProspects(supabase, 'partner-1');
    assert.deepEqual(out, rows);
    assert.deepEqual(ops, [
      ['from', 'partner_clients'],
      ['select', 'id, client_name, project_name, client_email, client_phone, notes, link_sent_at, link_sent_count, created_at'],
      ['eq', 'partner_id', 'partner-1'],
      ['order', 'created_at', { ascending: false }]
    ]);
  });

  await t.test('rejects when the query errors', async () => {
    const supabase = {
      from() {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          order() { return Promise.resolve({ data: null, error: { message: 'boom' } }); }
        };
        return chain;
      }
    };
    await assert.rejects(loadProspects(supabase, 'partner-1'), /boom/);
  });

  await t.test('returns [] when the query yields no rows', async () => {
    const supabase = {
      from() {
        const chain = {
          select() { return chain; },
          eq() { return chain; },
          order() { return Promise.resolve({ data: null, error: null }); }
        };
        return chain;
      }
    };
    assert.deepEqual(await loadProspects(supabase, 'partner-1'), []);
  });
});
