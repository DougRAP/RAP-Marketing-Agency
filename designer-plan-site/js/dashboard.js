/* ============================================================
   dashboard.js: signed-in state for the partner dashboard.

   Reads window.DP_AUTH (set by auth.js) and switches the
   dashboard pages between the public preview and the real
   signed-in view.

   Two data sources feed the page:
     1. Supabase (through auth.js): the partner's own account
        fields, studio name, account number, onboarding step.
     2. The engine (designerplan.io) through the dashboard-data
        BFF: sales, commission, referral code and Stripe status.
        See docs/dashboard-data-contract.md, sections B and C.

   The sales half renders one of four states:
     linked with sales   figures and the clients table
     linked, no sales    zeros and a "no sales yet" note
     not linked          zeros and a "once your account is matched" note
     unavailable         placeholders and the same note (BFF down)

   Element contract (already present in the dashboard markup):
     [data-field="<name>"]        text is replaced with real data
     [data-dp-when="signed-in"]   shown only with a session
     [data-dp-when="signed-out"]  hidden once signed in
     .status-state[data-state]    public | incomplete | active
     .state-switcher              dev-only preview switcher
     [data-action="copy-*"]       copy buttons
     #preview-ribbon              the ribbon above the hero preview
     .dp-sales-note               note under the figures (this script adds it)

   window.DP_DASHBOARD exposes renderClientsTable, formatCents and
   salesRowsFromCommissions so the client pipeline (B7) can feed
   the same table with its own rows.

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
  var SALES_TIMEOUT_MS = 12000;
  var PLANS_URL = 'thedesignerplan.com/plans?ref=';
  var BFF_URL = '/.netlify/functions/dashboard-data';
  var UNKNOWN = '\u2014';

  var COPY = {
    live: 'Your account is live.',
    real: ' Your details below are real.',
    loading: 'Loading your sales and commission.',
    notLinked: 'Sales and commission will appear here once your account is matched to our records.',
    noSales: 'No sales yet. Your first sale through your client link will appear here.'
  };

  var STRIPE_COPY = {
    NOT_CONNECTED: 'Stripe not connected yet. Connect it to receive commission.',
    PENDING: 'Stripe setup is in progress. Finish the Stripe steps to receive commission.',
    RESTRICTED: 'Stripe needs more information before payouts can go out. Open Stripe to finish.',
    READY: 'Stripe connected. Commission is paid straight to your account.'
  };

  var MONEY_FIELDS = {
    'commission-tracked': 'tracked_cents',
    'commission-pending': 'pending_cents',
    'commission-payable': 'payable_cents',
    'commission-paid': 'paid_cents'
  };
  var COUNT_FIELDS = ['plans-sold', 'active-plans', 'total-clients', 'links-sent'];

  var EMPTY_DATA = {
    tracked_cents: 0, pending_cents: 0, payable_cents: 0, paid_cents: 0,
    total_sales: 0, commissions: [], clients: []
  };

  var money = (typeof Intl !== 'undefined' && Intl.NumberFormat)
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    : null;

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

  // Sales fields repeat on a page (commission-tracked is in the hero and in
  // the ledger) and legitimately read 0, so this writes every match, always.
  function setFieldAll(name, text) {
    all('[data-field="' + name + '"]').forEach(function (el) {
      el.textContent = String(text);
    });
  }

  function formatCents(cents) {
    var n = Number(cents);
    if (!isFinite(n)) n = 0;
    var dollars = n / 100;
    return money ? money.format(dollars) : '$' + dollars.toFixed(2);
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
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

  function stripeCopyFromPartner(partner) {
    return (partner && partner.stripe_account_id) ? STRIPE_COPY.READY : STRIPE_COPY.NOT_CONNECTED;
  }

  // Real account data, straight from the partners row.
  function fillAccountFields(user, partner) {
    setField('studio-name', displayName(user, partner));
    if (!partner) return;

    setField('account-number', partner.account_number);

    // A fresh account has no referral code yet. Leaving the sample code on
    // screen would read as the partner's own, so say what is actually true
    // and take the copy buttons out of service. Once the engine answers,
    // applyReferralCode() overrides this with SOAR's affiliated id.
    if (partner.referral_code) {
      applyReferralCode(partner.referral_code);
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

    setField('stripe-note', stripeCopyFromPartner(partner));
  }

  function applyReferralCode(code) {
    if (!code) return;
    setField('referral-code', code);
    setField('client-link', PLANS_URL + code);
    setCopyButtonsEnabled(true);
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

  /* ---------------- sales: fetching ---------------- */

  // Only the overview and the clients page show sales; the other pages
  // have nothing to fill and should not hit the BFF.
  function hasSalesFields() {
    return !!(field('commission-tracked') || field('referral-code'));
  }

  function getAccessToken() {
    var sb = window.dpSupabase;
    if (!sb || !sb.auth || !sb.auth.getSession) {
      return Promise.reject(new Error('no supabase client'));
    }
    return sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      return (session && session.access_token) || null;
    });
  }

  function fetchDashboardData() {
    return getAccessToken().then(function (token) {
      if (!token) throw new Error('no session');
      var init = {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
        credentials: 'same-origin'
      };
      if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
        init.signal = AbortSignal.timeout(SALES_TIMEOUT_MS);
      }
      return fetch(BFF_URL, init);
    }).then(function (res) {
      if (!res.ok) throw new Error('dashboard-data ' + res.status);
      return res.json();
    });
  }

  /* ---------------- sales: rendering ---------------- */

  // The ribbon above the hero preview. Signed out it keeps its markup
  // ("Sample dashboard ... Log in to see yours"). Signed in it either goes
  // away (linked) or explains where the sales stand, without a login link.
  function renderRibbon(visible, sentence) {
    var ribbon = document.getElementById('preview-ribbon');
    if (!ribbon) return;
    if (!visible) { ribbon.hidden = true; return; }

    ribbon.innerHTML = '';
    var dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.setAttribute('aria-hidden', 'true');
    var text = document.createElement('span');
    var strong = document.createElement('strong');
    strong.textContent = COPY.live;
    text.appendChild(strong);
    text.appendChild(document.createTextNode(COPY.real + ' ' + sentence));
    ribbon.appendChild(dot);
    ribbon.appendChild(text);
    ribbon.hidden = false;
  }

  // "Sample data shown" under the hero figures is static markup; signed in
  // it is never true, whatever the BFF says.
  function hideStaticSampleNote() {
    all('.hero__sample-note').forEach(function (el) { el.hidden = true; });
  }

  // One note next to the figures themselves, for anyone who scrolls past
  // the ribbon. Only the states that need explaining get one.
  function renderSalesNote(state, sentence) {
    var existing = document.querySelector('.dp-sales-note');
    var needed = state === 'no-sales' || state === 'not-linked' || state === 'unavailable';
    if (!needed) {
      if (existing) existing.parentNode.removeChild(existing);
      return;
    }
    var note = existing;
    if (!note) {
      var anchor = field('commission-payable') || field('plans-sold');
      if (!anchor) return;
      var section = anchor.closest('section') || anchor.parentElement;
      if (!section) return;
      note = document.createElement('p');
      note.className = 'dp-sales-note';
      note.style.cssText =
        'margin:16px 0 0;font-size:0.8125rem;line-height:1.5;opacity:0.7;font-style:italic;';
      section.appendChild(note);
    }
    note.setAttribute('data-sales-state', state);
    note.textContent = sentence;
  }

  function countActive(commissions) {
    return commissions.filter(function (c) { return Number(c.months_remaining) > 0; }).length;
  }

  function countDistinctClients(commissions) {
    var seen = {};
    commissions.forEach(function (c) {
      var key = String(c.customer_last_name || '').trim().toLowerCase();
      if (key) seen[key] = true;
    });
    return Object.keys(seen).length;
  }

  function countLinksSent(clients) {
    return clients.filter(function (c) { return c.status === 'link_sent'; }).length;
  }

  function renderFigures(data) {
    var commissions = data.commissions || [];
    var clients = data.clients || [];
    Object.keys(MONEY_FIELDS).forEach(function (name) {
      setFieldAll(name, formatCents(data[MONEY_FIELDS[name]]));
    });
    var active = countActive(commissions);
    var linksSent = countLinksSent(clients);
    setFieldAll('plans-sold', Number(data.total_sales) || 0);
    setFieldAll('active-plans', active);
    setFieldAll('total-clients', countDistinctClients(commissions));
    setFieldAll('links-sent', linksSent);

    all('[data-field="clients-summary"]').forEach(function (el) {
      el.innerHTML = '';
      var strong = document.createElement('strong');
      strong.textContent = plural(active, 'active plan', 'active plans');
      el.appendChild(strong);
      el.appendChild(document.createTextNode(
        ' · ' + plural(linksSent, 'link sent', 'links sent') +
        ' · ' + formatCents(data.tracked_cents) + ' tracked'
      ));
    });
  }

  // While loading, and when the BFF is down, the sample numbers must not
  // stand in for the partner's own.
  function renderFigurePlaceholders(text) {
    Object.keys(MONEY_FIELDS).concat(COUNT_FIELDS, ['clients-summary']).forEach(function (name) {
      setFieldAll(name, text);
    });
  }

  /* ---------------- clients table ---------------- */

  // One normalized row model feeds the table, whatever the source. Today the
  // rows come from the engine's commissions; the client pipeline (B7) maps
  // its prospects into the same shape:
  //   { id, name, project, plan,
  //     status: 'active' | 'expired' | 'link_sent' | 'added', statusLabel,
  //     commissionCents: number | null, commissionLabel: text after the amount,
  //     details: [ { label, value } ] }
  function salesRowsFromCommissions(commissions) {
    return (commissions || []).map(function (c) {
      var remaining = Number(c.months_remaining) || 0;
      var coverage = Number(c.months_coverage) || 0;
      var active = remaining > 0;
      var cents = Number(c.commission_cents) || 0;
      var statusText = String(c.commission_status || '').toLowerCase();
      return {
        id: c.plan_registration_id == null ? '' : String(c.plan_registration_id),
        name: c.customer_last_name || '',
        project: '',
        plan: c.plan_type || '',
        status: active ? 'active' : 'expired',
        statusLabel: active ? 'Active' : 'Expired',
        commissionCents: cents,
        commissionLabel: statusText,
        details: [
          { label: 'Plan number', value: c.plan_number || '' },
          { label: 'Purchase date', value: c.purchase_date || '' },
          { label: 'Coverage', value: remaining + ' of ' + coverage + ' months remaining' },
          { label: 'Plan sent', value: c.plan_sent ? 'Yes' : 'No' },
          { label: 'Commission', value: (formatCents(cents) + ' ' + statusText).trim() }
        ]
      };
    });
  }

  function pillClass(status) {
    if (status === 'active') return 'status-pill status-pill--active';
    if (status === 'link_sent') return 'status-pill status-pill--sent';
    return 'status-pill';
  }

  function cell(tr, text, className) {
    var td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text == null ? '' : String(text);
    tr.appendChild(td);
    return td;
  }

  function clearTable() {
    var tbody = field('clients-table');
    if (tbody) tbody.innerHTML = '';
    return tbody;
  }

  function renderClientsTable(rows) {
    var tbody = clearTable();
    if (!tbody) return;

    (rows || []).forEach(function (row) {
      var tr = document.createElement('tr');
      tr.className = 'client-row';
      tr.setAttribute('data-row-toggle', '');
      if (row.id) tr.setAttribute('data-client-id', row.id);

      cell(tr, row.name, 'client-name');
      cell(tr, row.project);
      cell(tr, row.plan);

      var statusTd = cell(tr, '');
      var pill = document.createElement('span');
      pill.className = pillClass(row.status);
      pill.textContent = row.statusLabel || '';
      statusTd.appendChild(pill);

      var commissionTd = cell(tr, '', 'commission-cell');
      if (typeof row.commissionCents === 'number') {
        var strong = document.createElement('strong');
        strong.textContent = formatCents(row.commissionCents);
        commissionTd.appendChild(strong);
        if (row.commissionLabel) commissionTd.appendChild(document.createTextNode(' '));
      }
      if (row.commissionLabel) commissionTd.appendChild(document.createTextNode(row.commissionLabel));

      // Service column: the actions here have no backend yet (parked item 2).
      cell(tr, '');

      var expanded = document.createElement('tr');
      expanded.className = 'expanded-row is-hidden';
      var td = document.createElement('td');
      td.setAttribute('colspan', '6');
      var card = document.createElement('div');
      card.className = 'expanded-card';
      var title = document.createElement('div');
      title.className = 'line';
      var name = document.createElement('strong');
      name.textContent = row.name || '';
      title.appendChild(name);
      card.appendChild(title);
      (row.details || []).forEach(function (d) {
        var line = document.createElement('div');
        line.className = 'line';
        line.textContent = d.label + ': ' + d.value;
        card.appendChild(line);
      });
      td.appendChild(card);
      expanded.appendChild(td);

      tbody.appendChild(tr);
      tbody.appendChild(expanded);
    });
  }

  // Not a bare empty table: one full-width row that says why it is empty.
  function renderEmptyClientsTable(sentence) {
    var tbody = clearTable();
    if (!tbody) return;
    var tr = document.createElement('tr');
    tr.className = 'dp-table-note';
    var td = document.createElement('td');
    td.setAttribute('colspan', '6');
    td.textContent = sentence;
    td.style.cssText = 'padding:24px 16px;font-style:italic;opacity:0.7;';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }

  // The page's own script binds a click on the sample rows at load; the
  // rows this script renders arrive later, so one delegated listener on the
  // tbody covers them all.
  function wireClientsTable() {
    var tbody = field('clients-table');
    if (!tbody) return;
    tbody.addEventListener('click', function (e) {
      if (e.target.closest('a, button, .link-action')) return;
      var tr = e.target.closest('tr.client-row');
      if (!tr || !tbody.contains(tr)) return;
      var next = tr.nextElementSibling;
      if (next && next.classList.contains('expanded-row')) next.classList.toggle('is-hidden');
    });
  }

  /* ---------------- Stripe ---------------- */

  function renderStripe(stripeStatus, partner) {
    var copy = STRIPE_COPY[stripeStatus] || stripeCopyFromPartner(partner);
    setField('stripe-note', copy);
    if (stripeStatus !== 'READY') return;
    // Tick the checklist item, and never un-tick one: the page only ever
    // learns that more is done, not less.
    all('[data-field="setup-checklist"] li').forEach(function (li) {
      if (!/Stripe connected/.test(li.textContent || '')) return;
      li.classList.add('is-done');
      var icon = li.querySelector('.check-icon');
      if (icon) {
        icon.classList.add('check-icon--done');
        icon.textContent = '\u2713';
      }
    });
  }

  /* ---------------- sales: the four states ---------------- */

  function renderNotLinked(data) {
    renderRibbon(true, COPY.notLinked);
    renderSalesNote('not-linked', COPY.notLinked);
    renderFigures(Object.assign({}, EMPTY_DATA, { clients: (data && data.clients) || [] }));
    renderEmptyClientsTable(COPY.notLinked);
  }

  function renderSales(data, partner) {
    if (!data || data.linked !== true) { renderNotLinked(data); return; }

    applyReferralCode(data.affiliated_id);
    renderStripe(data.stripe_status, partner);
    renderFigures(data);
    renderRibbon(false);

    var commissions = data.commissions || [];
    if (!commissions.length) {
      renderSalesNote('no-sales', COPY.noSales);
      renderEmptyClientsTable(COPY.noSales);
      return;
    }
    renderSalesNote('linked');
    renderClientsTable(salesRowsFromCommissions(commissions));
  }

  function renderSalesUnavailable() {
    renderRibbon(true, COPY.notLinked);
    renderSalesNote('unavailable', COPY.notLinked);
    renderFigurePlaceholders(UNKNOWN);
    renderEmptyClientsTable(COPY.notLinked);
  }

  function loadSales(partner) {
    renderRibbon(true, COPY.loading);
    renderSalesNote('loading');
    renderFigurePlaceholders(UNKNOWN);
    fetchDashboardData()
      .then(function (data) { renderSales(data, partner); })
      .catch(function () { renderSalesUnavailable(); });
  }

  /* ---------------- copy buttons ---------------- */

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

  /* ---------------- boot ---------------- */

  function render() {
    var auth = window.DP_AUTH || {};
    var user = auth.user;
    var partner = auth.partner;
    var signedIn = !!user;
    var state = resolveState(user, partner);

    toggleByAuth(signedIn);
    if (signedIn) fillAccountFields(user, partner);
    applyState(state, signedIn);
    document.documentElement.setAttribute('data-dp-state', state);

    if (!signedIn) return;
    hideStaticSampleNote();
    if (hasSalesFields()) loadSales(partner);
  }

  function start() {
    wireCopyButtons();
    wireClientsTable();
    whenAuthReady(function () { render(); });
  }

  window.DP_DASHBOARD = {
    renderClientsTable: renderClientsTable,
    formatCents: formatCents,
    salesRowsFromCommissions: salesRowsFromCommissions
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
