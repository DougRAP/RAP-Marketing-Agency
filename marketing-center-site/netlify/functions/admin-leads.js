// /.netlify/functions/admin-leads
// Marketing-center admin endpoint. Gated by the existing Basic Auth
// on /private/* (see marketing-center-site/_headers).
// Returns: list overview, members, and unassigned lead pool.
//
// Modes (query string ?mode=...):
//   overview         (default) → all email_lists with member counts
//   list?id=<uuid>            → members of one list
//   leads?q=<search>          → search the leads pool (top 100)
//   add { list_id, lead_id }  → add a lead to a list (POST)
//   remove { list_id, lead_id } → remove a lead from a list (POST)
//   export?list_id=<uuid>     → CSV export of a list

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;

function json(status, body, extra) {
  return {
    statusCode: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}),
    body: JSON.stringify(body)
  };
}

function csvCell(v) {
  if (v == null) return '';
  var s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? '"' + s + '"' : s;
}

exports.handler = async (event) => {
  if (!supabase) return json(500, { error: 'supabase_not_configured' });

  const params = event.queryStringParameters || {};
  const mode = params.mode || 'overview';

  try {
    // ---- READS (GET) ----
    if (event.httpMethod === 'GET') {
      if (mode === 'overview') {
        const { data: lists } = await supabase
          .from('email_lists')
          .select('id, slug, name, description, emailoctopus_id')
          .order('slug');
        // count members per list (one query per list — small set, fine)
        const counts = await Promise.all((lists || []).map(async (l) => {
          const { count } = await supabase
            .from('email_list_members')
            .select('lead_id', { count: 'exact', head: true })
            .eq('list_id', l.id);
          return { ...l, member_count: count || 0 };
        }));
        return json(200, { lists: counts });
      }

      if (mode === 'list') {
        if (!params.id) return json(400, { error: 'list_id_required' });
        const { data } = await supabase
          .from('email_list_members')
          .select('added_at, added_by, lead:lead_id (id, email, full_name, company, status, created_at)')
          .eq('list_id', params.id)
          .order('added_at', { ascending: false })
          .limit(500);
        return json(200, { members: data || [] });
      }

      if (mode === 'leads') {
        const q = (params.q || '').trim();
        let query = supabase
          .from('admin_leads_view')
          .select('id, email, full_name, company, status, partner_status, last_event_source, last_event_at, created_at')
          .order('created_at', { ascending: false })
          .limit(100);
        if (q) {
          query = query.or(
            `email.ilike.%${q}%,full_name.ilike.%${q}%,company.ilike.%${q}%`
          );
        }
        const { data } = await query;
        return json(200, { leads: data || [] });
      }

      if (mode === 'export') {
        if (!params.list_id) return json(400, { error: 'list_id_required' });
        const { data } = await supabase
          .from('email_list_members')
          .select('lead:lead_id (email, full_name, company, phone, status, created_at)')
          .eq('list_id', params.list_id);
        const header = ['email','full_name','company','phone','status','created_at'];
        const rows = (data || []).map(r => r.lead).filter(Boolean).map(l =>
          header.map(h => csvCell(l[h])).join(',')
        );
        const csv = header.join(',') + '\n' + rows.join('\n');
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="list-' + params.list_id + '.csv"'
          },
          body: csv
        };
      }
    }

    // ---- WRITES (POST) ----
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const op = body.op;

      if (op === 'add' && body.list_id && body.lead_id) {
        await supabase.from('email_list_members').upsert({
          list_id: body.list_id,
          lead_id: body.lead_id,
          added_by: 'admin-ui'
        });
        return json(200, { ok: true });
      }

      if (op === 'remove' && body.list_id && body.lead_id) {
        await supabase.from('email_list_members')
          .delete()
          .eq('list_id', body.list_id)
          .eq('lead_id', body.lead_id);
        return json(200, { ok: true });
      }

      if (op === 'create_list' && body.slug && body.name) {
        const { data, error } = await supabase
          .from('email_lists')
          .insert({ slug: body.slug, name: body.name, description: body.description || null })
          .select()
          .single();
        if (error) return json(400, { error: error.message });
        return json(200, { list: data });
      }

      return json(400, { error: 'unknown_op' });
    }

    return json(405, { error: 'method_not_allowed' });
  } catch (e) {
    console.error('admin-leads error', e);
    return json(500, { error: 'server_error', detail: String(e) });
  }
};
