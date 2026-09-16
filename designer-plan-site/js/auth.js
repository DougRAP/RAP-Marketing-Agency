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
    mode: 'stub',
    signIn: function () {
      return Promise.reject(new Error('auth.js not initialized yet'));
    },
    signInPassword: function () {
      return Promise.reject(new Error('auth.js not initialized yet'));
    },
    setPassword: function () {
      return Promise.reject(new Error('auth.js not initialized yet'));
    },
    requestPasswordReset: function () {
      return Promise.reject(new Error('auth.js not initialized yet'));
    },
    signOut: function () {
      return Promise.reject(new Error('auth.js not initialized yet'));
    },
    requireAuth: function () { return false; }
  };

  // Swap nav "Log in" links to "<email> · Log out" when a session is
  // present. Scoped to header/footer/nav/aside — leaves in-content CTAs
  // like "Log in to my dashboard" alone.
  var ACCOUNT_LINK_SELECTOR = [
    'header a[href="/login"]',
    'footer a[href="/login"]',
    'aside a[href="/login"]',
    'nav a[href="/login"]'
  ].join(', ');

  function renderAccountLinks(){
    var user = window.DP_AUTH.user;
    document.querySelectorAll(ACCOUNT_LINK_SELECTOR).forEach(function(a){
      if (user) {
        if (!a.dataset.dpOriginalText) {
          a.dataset.dpOriginalText = a.textContent.trim();
        }
        a.textContent = user.email + ' · Log out';
        a.dataset.dpAccountLink = 'signed-in';
      } else if (a.dataset.dpAccountLink === 'signed-in') {
        a.textContent = a.dataset.dpOriginalText || 'Log in';
        a.dataset.dpAccountLink = '';
      }
    });
  }

  document.addEventListener('click', function(e){
    var a = e.target.closest('a[data-dp-account-link="signed-in"]');
    if (!a) return;
    e.preventDefault();
    if (!window.DP_AUTH.signOut) return;
    window.DP_AUTH.signOut().then(function(){
      renderAccountLinks();
      window.location.replace('/');
    });
  });

  function markReady(){
    window.DP_AUTH.ready = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', renderAccountLinks, { once: true });
    } else {
      renderAccountLinks();
    }
    document.dispatchEvent(new Event('dp-auth-ready'));
  }

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
      window.DP_AUTH.mode = 'live';

      window.DP_AUTH.signIn = function (email, options) {
        var opts = Object.assign(
          { emailRedirectTo: window.location.origin + '/dashboard/' },
          options || {}
        );
        return sb.auth.signInWithOtp({ email: email, options: opts });
      };

      window.DP_AUTH.signInPassword = function (email, password) {
        return sb.auth.signInWithPassword({ email: email, password: password });
      };

      // Sets the password on the session that is already open. Works for a
      // magic-link session, which is how every existing partner got here.
      //
      // The signOut of other sessions is not optional: setting a password
      // turns temporary access into a permanent credential, so anyone who
      // found an abandoned session on a shared computer could otherwise keep
      // the account for good.
      window.DP_AUTH.setPassword = function (password) {
        return sb.auth.updateUser({ password: password }).then(function (res) {
          if (res.error) return res;
          return sb.auth.signOut({ scope: 'others' })
            .catch(function () { /* best effort, the password is already set */ })
            .then(function () { return res; });
        });
      };

      // The recovery email is a single-use link like any other, so it goes
      // through /login/confirm too. Supabase deliberately answers the same
      // way whether or not the address is registered.
      window.DP_AUTH.requestPasswordReset = function (email) {
        return sb.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/dashboard/profile'
        });
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
        if (!window.DP_AUTH.user) window.DP_AUTH.partner = null;
        renderAccountLinks();
      });

      return sb.auth.getSession().then(function(res){
        var session = res && res.data && res.data.session;
        if (!session) { markReady(); return; }
        window.DP_AUTH.user = session.user;

        // Ensure a partner row exists for this user. The function is
        // idempotent — returns the existing row if already linked,
        // links a legacy row by email, or creates a fresh one. Failure
        // here is non-fatal: we still mark the user signed in.
        return fetch('/.netlify/functions/account-bootstrap', {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + session.access_token,
            'Content-Type': 'application/json'
          }
        }).then(function(r){
          return r.json().catch(function(){ return {}; });
        }).catch(function(err){
          console.warn('[auth] account-bootstrap failed:', err);
          return {};
        }).then(function(){
          return sb.from('partners')
            .select('id, commission_rate, status, account_number, studio_name, ' +
                    'referral_code, stripe_account_id, lifecycle_status, onboarding_step')
            .eq('auth_user_id', session.user.id)
            .maybeSingle()
            .then(function(r){
              if (r.data) {
                window.DP_AUTH.partner = {
                  id: r.data.id,
                  account_number: r.data.account_number,
                  commission_rate: r.data.commission_rate || 0.35,
                  status: r.data.status,
                  studio_name: r.data.studio_name,
                  referral_code: r.data.referral_code,
                  stripe_account_id: r.data.stripe_account_id,
                  lifecycle_status: r.data.lifecycle_status,
                  onboarding_step: r.data.onboarding_step
                };
              }
              markReady();
            });
        });
      });
    })
    .catch(function(err){
      console.error('[auth] init failed:', err);
      markReady();
    });
})();
