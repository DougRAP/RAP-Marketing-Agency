/* ============================================================
   auth.js — partner session for designer-plan-site
   Fetches /.netlify/functions/public-config, initializes the
   Supabase JS client, and exposes:
     window.dpSupabase  — Supabase client
     window.DP_AUTH     — { user, partner, ready, signIn, signOut, requireAuth }
   Fires the `dp-auth-ready` event once state is resolved.
   Loaded BEFORE cart.js so the cart can read DP_AUTH.
   ============================================================ */
(function(){
  'use strict';

  window.DP_AUTH = {
    user: null,
    partner: null,
    ready: false,
    signIn: function () {
      return Promise.reject(new Error('auth.js not initialized yet'));
    },
    signOut: function () {
      return Promise.reject(new Error('auth.js not initialized yet'));
    },
    requireAuth: function () { return false; }
  };

  function markReady(){
    window.DP_AUTH.ready = true;
    document.dispatchEvent(new Event('dp-auth-ready'));
  }

  // ?partner=1 preview shortcut for dev/QA (no real session).
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('partner') === '1') {
      window.DP_AUTH.user = { email: 'preview@studio.com' };
      window.DP_AUTH.partner = { id: 'preview', commission_rate: 0.35 };
      markReady();
      return;
    }
  } catch (e) { /* noop */ }

  if (!window.supabase) {
    console.warn('[auth] Supabase JS not loaded; running in stub mode.');
    markReady();
    return;
  }

  fetch('/.netlify/functions/public-config')
    .then(function(r){
      if (!r.ok) throw new Error('public-config returned ' + r.status);
      return r.json();
    })
    .then(function(cfg){
      if (!cfg.url || !cfg.anonKey) {
        throw new Error(cfg.error || 'public-config payload missing url/anonKey');
      }

      var sb = window.supabase.createClient(cfg.url, cfg.anonKey);
      window.dpSupabase = sb;

      window.DP_AUTH.signIn = function (email, options) {
        var opts = Object.assign(
          { emailRedirectTo: window.location.origin + '/dashboard' },
          options || {}
        );
        return sb.auth.signInWithOtp({ email: email, options: opts });
      };

      window.DP_AUTH.signOut = function () {
        return sb.auth.signOut().then(function(){
          window.DP_AUTH.user = null;
          window.DP_AUTH.partner = null;
        });
      };

      window.DP_AUTH.requireAuth = function (redirect) {
        if (!window.DP_AUTH.user) {
          window.location.replace(redirect || '/login');
          return false;
        }
        return true;
      };

      sb.auth.onAuthStateChange(function(_event, session){
        window.DP_AUTH.user = session ? session.user : null;
      });

      return sb.auth.getSession().then(function(res){
        var session = res && res.data && res.data.session;
        if (!session) { markReady(); return; }
        window.DP_AUTH.user = session.user;

        return sb.from('partners')
          .select('id, commission_rate, status')
          .eq('auth_user_id', session.user.id)
          .eq('status', 'approved')
          .maybeSingle()
          .then(function(r){
            if (r.data) {
              window.DP_AUTH.partner = {
                id: r.data.id,
                commission_rate: r.data.commission_rate || 0.35
              };
            }
            markReady();
          });
      });
    })
    .catch(function(err){
      console.error('[auth] init failed:', err);
      markReady();
    });
})();
