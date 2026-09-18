// A minimal in-memory stand-in for the supabase-js client, just enough for
// the client-add / client-send-link functions. Records every call so tests
// can assert what was queried and what was written, and never touches the
// network.
//
//   makeFakeSupabase({ user, partner, client, insertResult, updateResult })
//
//   auth.getUser(jwt)  -> { data: { user }, error } ; jwt === 'bad' or no user -> error
//   from(table)        -> chain supporting select / eq / insert / update /
//                         maybeSingle / single. Resolution:
//                           insert chain  -> insertResult
//                           update chain  -> updateResult
//                           partners      -> partner (null when absent)
//                           partner_clients -> client (null when absent)
//
//   fake.calls          every from() call: { table, ops: [[name, ...args]], insert?, update? }
//   fake.callsTo(table) the subset for one table

function makeFakeSupabase(opts) {
  const o = opts || {};
  const calls = [];

  function resolve(call) {
    if (call.insert !== undefined) {
      return call.insertResult || o.insertResult || { data: null, error: { message: 'no insertResult configured' } };
    }
    if (call.update !== undefined) {
      return o.updateResult || { data: null, error: { message: 'no updateResult configured' } };
    }
    if (call.table === 'partners') return { data: o.partner == null ? null : o.partner, error: null };
    if (call.table === 'partner_clients') return { data: o.client == null ? null : o.client, error: null };
    return { data: null, error: null };
  }

  const fake = {
    calls,
    callsTo(table) {
      return calls.filter((c) => c.table === table);
    },
    auth: {
      async getUser(jwt) {
        if (jwt === 'bad' || !o.user) {
          return { data: { user: null }, error: { message: 'invalid JWT' } };
        }
        return { data: { user: o.user }, error: null };
      }
    },
    from(table) {
      const call = { table, ops: [] };
      calls.push(call);
      const chain = {
        select(cols) { call.ops.push(['select', cols]); return chain; },
        eq(col, val) { call.ops.push(['eq', col, val]); return chain; },
        insert(payload) { call.ops.push(['insert', payload]); call.insert = payload; return chain; },
        update(payload) { call.ops.push(['update', payload]); call.update = payload; return chain; },
        async maybeSingle() { call.ops.push(['maybeSingle']); return resolve(call); },
        async single() { call.ops.push(['single']); return resolve(call); }
      };
      return chain;
    }
  };
  return fake;
}

/** The eq() filters of one recorded call, as { column: value }. */
function eqFilters(call) {
  const out = {};
  for (const op of call.ops) {
    if (op[0] === 'eq') out[op[1]] = op[2];
  }
  return out;
}

module.exports = { makeFakeSupabase, eqFilters };
