// /.netlify/functions/env-check
// TEMPORARY diagnostic. Reports env-var visibility AND attempts a
// read + write against the leads table, returning the raw Supabase
// error. Leaks no secret values. Delete after debugging.

const { createClient } = require('@supabase/supabase-js');

exports.handler = async () => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';
  const supabaseNames = Object.keys(process.env)
    .filter(k => k.toUpperCase().includes('SUPABASE'));

  const out = {
    has_url: !!url,
    has_key: !!key,
    key_length: key.length,
    env_var_names: supabaseNames,
    select_error: null,
    insert_error: null,
    insert_ok: false
  };

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const sel = await supabase.from('leads').select('id').limit(1);
      out.select_error = sel.error ? sel.error.message : null;
      const testEmail = 'diag-' + Date.now() + '@example.com';
      const ins = await supabase.from('leads').insert({ email: testEmail }).select();
      out.insert_error = ins.error ? ins.error.message : null;
      out.insert_ok = !!(ins.data && ins.data.length);
    } catch (e) {
      out.insert_error = 'exception: ' + String(e);
    }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(out)
  };
};
