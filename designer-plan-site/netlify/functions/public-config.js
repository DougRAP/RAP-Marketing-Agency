// netlify/functions/public-config.js
// Returns the values the browser needs to talk to Supabase directly:
//   - SUPABASE_URL: the public project endpoint.
//   - SUPABASE_ANON_KEY: the "publishable" key, gated by RLS on every table.
// The SERVICE_ROLE_KEY is server-side only and never appears here.

exports.handler = async () => {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY env var on the site.'
      })
    };
  }

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300'
    },
    body: JSON.stringify({ url, anonKey })
  };
};
