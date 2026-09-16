/* ============================================================
   dashboard.js — signed-in state for the partner dashboard.

   Reads window.DP_AUTH (set by auth.js) and switches the
   dashboard pages between the public preview and the real
   signed-in view.

   What is LIVE today: the account fields that live in Supabase
   (studio name, referral code, client link, setup progress,
   Stripe status). Those are the partner's own data.

   What is still SAMPLE: sales and commission figures. Those come
   from the engine (designerplan.io) through a BFF that is not
   built yet, so they stay visibly labelled as examples instead of
   being passed off as the partner's own numbers.

   Element contract (already present in the dashboard markup):
     [data-field="<name>"]        text is replaced with real data
     [data-dp-when="signed-in"]   shown only with a session
     [data-dp-when="signed-out"]  hidden once signed in
     .status-state[data-state]    public | incomplete | active
     .state-switcher              dev-only preview switcher
     [data-action="copy-*"]       copy buttons

   Must load AFTER auth.js.
   ============================================================ */
(function () {
  'use strict';

  // The dashboard pages style .hero-ctas, .state-switcher and friends with
  // `display: flex`, which outranks the user-agent rule for [hidden] and
  // leaves "hidden" elements on screen. This script runs from <head>, so
  // injecting the rule here also prevents a flash of the wrong state before
  // the session resolves.
  (function injectHiddenRule() {
    var style = document.createElement('style');
    style.textContent = '[hidden]{display:none !important}';
    (document.head || document.documentElement).appendChild(style);
  })();

  var AUTH_TIMEOUT_MS = 8000;
  var PLANS_URL = 'thedesignerplan.com/plans?ref=';


  function all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function field(name) {
    return document.querySelector('[data-field="' + name + '"]');
  }

  function setField(name, value) {
    var el = field(name);
    if (el && value) el.textContent = value;
    return el;
  }

  // Auth resolves over several network hops. Never hang the page on it:
  // ready === false means we fall back to the public view.
  function whenAuthReady(cb) {
    if (window.DP_AUTH && window.DP_AUTH.ready) { cb(true); return; }
    var settled = false;
    function onReady() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cb(true);
    }
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      document.removeEventListener('dp-auth-ready', onReady);
      cb(false);
    }, AUTH_TIMEOUT_MS);
    document.addEventListener('dp-auth-ready', onReady, { once: true });
  }

  // Which of the three designed states applies.
  function resolveState(user, partner) {
    if (!user) return 'public';
    if (!partner) return 'incomplete';
    var setupDone = !!partner.stripe_account_id && Number(partner.onboarding_step) >= 5;
    return setupDone ? 'active' : 'incomplete';
  }

  function displayName(user, partner) {
    if (partner && partner.studio_name) return partner.studio_name;
    if (user && user.email) return user.email;
    return 'Your studio';
  }

  function toggleByAuth(signedIn) {
    all('[data-dp-when]').forEach(function (el) {
      var want = el.getAttribute('data-dp-when');
      el.hidden = (want === 'signed-in') ? !signedIn : signedIn;
    });
  }

  // Real account data, straight from the partners row.
  function fillAccountFields(user, partner) {
    setField('studio-name', displayName(user, partner));
    if (!partner) return;

    setField('account-number', partner.account_number);

    // A fresh account has no referral code yet. Leaving the sample code on
    // screen would read as the partner's own, so say what is actually true
    // and take the copy buttons out of service.
    if (partner.referral_code) {
      setField('referral-code', partner.referral_code);
      setField('client-link', PLANS_URL + partner.referral_code);
      setCopyButtonsEnabled(true);
    } else {
      setField('referral-code', 'Not assigned yet');
      setField('client-link', 'Ready once your referral code is assigned');
      setCopyButtonsEnabled(false);
    }

    var step = Number(partner.onboarding_step);
    if (step >= 1 && step <= 5) {
      var line = 'Account setup: ' + step + ' of 5 complete.';
      if (!partner.stripe_account_id) {
        line += ' Next: connect Stripe so you can receive commission.';
      }
      setField('setup-progress-line', line);
    }

    setField('stripe-note', partner.stripe_account_id
      ? 'Stripe connected. Commission is paid straight to your account.'
      : 'Stripe not connected yet. Connect it to receive commission.');
  }

  function setCopyButtonsEnabled(enabled) {
    all('[data-action="copy-client-link"], [data-action="copy-referral-code"]').forEach(function (btn) {
      btn.disabled = !enabled;
      btn.setAttribute('aria-disabled', String(!enabled));
      btn.style.opacity = enabled ? '' : '0.45';
      btn.style.cursor = enabled ? '' : 'not-allowed';
    });
  }

  // Show the state the account is actually in, and retire the dev switcher
  // once there is a real session behind the page.
  function applyState(state, signedIn) {
    all('.status-state').forEach(function (el) {
      el.classList.toggle('is-active', el.getAttribute('data-state') === state);
    });
    if (signedIn) {
      all('.state-switcher').forEach(function (el) { el.hidden = true; });
    }
  }

  // Say plainly which numbers are not theirs yet.
  function labelSampleData(signedIn) {
    var ribbon = document.getElementById('preview-ribbon');
    if (ribbon && signedIn) {
      ribbon.innerHTML = '';
      var dot = document.createElement('span');
      dot.className = 'status-dot';
      dot.setAttribute('aria-hidden', 'true');
      var text = document.createElement('span');
      var strong = document.createElement('strong');
      strong.textContent = 'Your account is live.';
      text.appendChild(strong);
      text.appendChild(document.createTextNode(
        ' Your details below are real. Sales and commission figures are still ' +
        'sample data until we connect the reporting feed.'
      ));
      ribbon.appendChild(dot);
      ribbon.appendChild(text);
      ribbon.hidden = false;
    }

    if (!signedIn) return;

    // One note next to the figures themselves, for anyone who scrolls
    // past the ribbon.
    var anchor = field('commission-payable') || field('plans-sold');
    if (!anchor) return;
    var section = anchor.closest('section') || anchor.parentElement;
    if (!section || section.querySelector('.dp-sample-note')) return;

    var note = document.createElement('p');
    note.className = 'dp-sample-note';
    note.textContent = 'Example figures. Your own sales and commission appear here once the reporting feed is connected.';
    note.style.cssText =
      'margin:16px 0 0;font-size:0.8125rem;line-height:1.5;opacity:0.7;font-style:italic;';
    section.appendChild(note);
  }

  function copyToClipboard(text, btn) {
    function done() {
      var original = btn.getAttribute('data-original-label') || btn.textContent;
      btn.setAttribute('data-original-label', original);
      btn.textContent = 'Copied';
      setTimeout(function () { btn.textContent = original; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {});
      return;
    }
    // Older browsers: a hidden textarea is still the only way.
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:absolute;left:-9999px;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* noop */ }
    document.body.removeChild(ta);
  }

  function wireCopyButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="copy-client-link"], [data-action="copy-referral-code"]');
      if (!btn || btn.disabled) return;
      e.preventDefault();
      var name = btn.getAttribute('data-action') === 'copy-client-link'
        ? 'client-link'
        : 'referral-code';
      var source = field(name);
      if (source) copyToClipboard((source.textContent || '').trim(), btn);
    });
  }

  function render() {
    var auth = window.DP_AUTH || {};
    var user = auth.user;
    var partner = auth.partner;
    var signedIn = !!user;
    var state = resolveState(user, partner);

    toggleByAuth(signedIn);
    if (signedIn) fillAccountFields(user, partner);
    applyState(state, signedIn);
    labelSampleData(signedIn);

    document.documentElement.setAttribute('data-dp-state', state);
  }

  function start() {
    wireCopyButtons();
    whenAuthReady(function () { render(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
