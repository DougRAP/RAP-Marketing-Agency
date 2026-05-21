// Shared Supabase service-role client for rap-public-site functions.
// SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY must be set in Netlify env vars
// on the rap-designer-programs site. The service role key bypasses RLS —
// never expose this on the client.

const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.warn('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
}

const supabase = (url && key)
  ? createClient(url, key, { auth: { persistSession: false } })
  : null;

module.exports = { supabase };
