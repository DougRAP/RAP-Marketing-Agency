/* ============================================================
   auth.js — partner session check for designer-plan-site
   Reads Supabase session and exposes window.DP_AUTH = { user, partner }
   where partner = { id, commission_rate } if the logged-in user is
   an approved partner, otherwise null.

   Loaded BEFORE cart.js so cart.js can read the resolved state.
   ============================================================ */
(function(){
  'use strict';

  // Default: no auth. Real wiring happens once Supabase project URL +
  // anon key are set as Netlify env vars and exposed at build time
  // (see DEPLOY.md). For now we expose a stub the dev team can swap.
  window.DP_AUTH = {
    user: null,
    partner: null,
    ready: false
  };

  // Allow ?partner=1 in URL during dev/QA to preview the partner UI
  // without a real session.
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('partner') === '1') {
      window.DP_AUTH.user = { email: 'preview@studio.com' };
      window.DP_AUTH.partner = { id: 'preview', commission_rate: 0.35 };
    }
  } catch (e) { /* noop */ }

  // Real Supabase wiring (commented out until env vars are configured).
  // Dev team: uncomment, fill in SUPABASE_URL + SUPABASE_ANON_KEY at build,
  // and a partners-policy view that returns the current user's partner row.
  /*
  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    var sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    sb.auth.getSession().then(function(res){
      var session = res && res.data && res.data.session;
      if (!session) { window.DP_AUTH.ready = true; document.dispatchEvent(new Event('dp-auth-ready')); return; }
      window.DP_AUTH.user = session.user;
      sb.from('partners')
        .select('id, commission_rate, status')
        .eq('auth_user_id', session.user.id)
        .eq('status', 'approved')
        .maybeSingle()
        .then(function(r){
          if (r.data) window.DP_AUTH.partner = { id: r.data.id, commission_rate: r.data.commission_rate || 0.35 };
          window.DP_AUTH.ready = true;
          document.dispatchEvent(new Event('dp-auth-ready'));
        });
    });
  } else {
    window.DP_AUTH.ready = true;
  }
  */

  // Synchronous-ready in the placeholder path.
  window.DP_AUTH.ready = true;
})();
