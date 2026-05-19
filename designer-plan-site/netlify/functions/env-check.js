// /.netlify/functions/env-check
// TEMPORARY diagnostic. Reports whether Supabase env vars are visible
// to the function runtime. Leaks no secret values — only names,
// presence booleans, and lengths. Delete after debugging.

exports.handler = async () => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseNames = Object.keys(process.env)
    .filter(k => k.toUpperCase().includes('SUPABASE'));
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      has_SUPABASE_URL: !!url,
      has_SUPABASE_SERVICE_ROLE_KEY: !!key,
      SUPABASE_URL_starts_with: url.slice(0, 13),
      SUPABASE_SERVICE_ROLE_KEY_length: key.length,
      all_env_var_names_containing_supabase: supabaseNames
    })
  };
};
