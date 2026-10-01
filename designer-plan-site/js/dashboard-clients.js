/* ============================================================
   dashboard-clients.js: the client pipeline on the clients page.

   Contract F of docs/dashboard-data-contract.md. dashboard.js
   fetches /.netlify/functions/dashboard-data and announces every
   answer as a 'dp-dashboard-data' event (detail { data, state },
   also kept on DP_DASHBOARD.lastData). This script listens, keeps
   `data.clients` as local state and renders the table from it
   through DP_DASHBOARD.renderClientsTable, so a sale and a prospect
   look the same in the one list.

   It also owns:
     [data-action="filter-status"]  status filter (Added, Link sent, Active, Expired)
     [data-action="filter-search"]  matches name, project and email
     [data-action="send-link"]      POST client-send-link for a prospect row
     [data-action="add-client"]     toggles #add-client-form
     #add-client-form               POST client-add, prepends the row locally
     #clients-modal                 holds the page while add / send is running,
                                    closes itself on success, waits on an error
     #clients-status                banner with the last result of either action
     [data-field="clients-note"]    "not linked" note under the table

   Loaded on dashboard/clients/index.html only, AFTER dashboard.js.
   ============================================================ */
(function () {
  'use strict';

  var ADD_URL = '/.netlify/functions/client-add';
  var SEND_URL = '/.netlify/functions/client-send-link';

  var COPY = {
    notLinked: 'Sales will appear here once your account is matched to our records. Sending links becomes available then.',
    empty: 'No clients yet. Add a client to send them your plan link.',
    unavailable: 'We could not load your clients right now.',
    noMatch: 'No clients match your search.',
    titleSending: 'Sending the link',
    sendingTo: 'Sending the link to ',
    titleSent: 'Link sent',
    sent: 'Link sent to ',
    titleNotSent: 'The link was not sent',
    titleNotLinked: 'Not available yet',
    rateLimited: 'Already sent in the last 10 minutes.',
    emailNotConfigured: 'Email sending is not set up yet.',
    sendFailed: 'Could not send the link. Please try again.',
    titleSaving: 'Saving the client',
    savingName: 'Saving ',
    titleSaved: 'Client added',
    added: 'Client added: ',
    addedReload: ' Reload the page to see your list.',
    titleNotSaved: 'The client was not saved',
    duplicate: "That client's email is already on your list.",
    saveFailed: 'Could not save the client. Please try again.',
    required: 'Client name and email are required.',
    notSignedIn: 'Not signed in. Refresh the page and try again.'
  };

  var STATUS_LABELS = { active: 'Active', expired: 'Expired', link_sent: 'Link sent', added: 'Added' };
  var STATUS_OPTIONS = [
    ['all', 'Status: All'],
    ['added', 'Added'],
    ['link_sent', 'Link sent'],
    ['active', 'Active'],
    ['expired', 'Expired']
  ];

  var state = {
    received: false,     // a dashboard-data answer (or failure) has arrived
    available: false,    // that answer was usable
    linked: false,
    clients: [],
    commissions: [],
    filterStatus: 'all',
    search: ''
  };

  function all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function field(name) {
    return document.querySelector('[data-field="' + name + '"]');
  }

  function setFieldAll(name, text) {
    all('[data-field="' + name + '"]').forEach(function (el) {
      el.textContent = String(text);
    });
  }

  function dash() {
    return window.DP_DASHBOARD;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function formatDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    try {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return d.toDateString();
    }
  }

  /* ---------------- row model ---------------- */

  function commissionFor(planRegistrationId) {
    if (planRegistrationId == null) return null;
    for (var i = 0; i < state.commissions.length; i++) {
      if (state.commissions[i].plan_registration_id === planRegistrationId) return state.commissions[i];
    }
    return null;
  }

  function isProspectStage(status) {
    return status === 'added' || status === 'link_sent';
  }

  // Contract F row -> the row model dashboard.js renders.
  function toRow(c) {
    var sale = commissionFor(c.plan_registration_id);
    var count = Number(c.link_sent_count) || 0;
    var details = [];
    if (c.client_email) details.push({ label: 'Email', value: c.client_email });
    if (c.project_name) details.push({ label: 'Project', value: c.project_name });
    if (c.plan_number) details.push({ label: 'Plan number', value: c.plan_number });
    if (c.months_remaining != null) {
      details.push({ label: 'Coverage', value: plural(Number(c.months_remaining) || 0, 'month', 'months') + ' remaining' });
    }
    if (c.link_sent_at) {
      details.push({ label: 'Link sent', value: formatDate(c.link_sent_at) + ' (' + plural(count, 'send', 'sends') + ')' });
    }

    var row = {
      id: c.id || '',
      name: c.client_name || '',
      project: c.project_name || '',
      plan: sale ? (sale.plan_type || '') : '',
      status: c.status,
      statusLabel: STATUS_LABELS[c.status] || String(c.status || ''),
      commissionCents: sale ? (Number(sale.commission_cents) || 0) : null,
      commissionLabel: sale ? String(sale.commission_status || '').toLowerCase() : '',
      details: details
    };
    if (isProspectStage(c.status) && c.id) {
      row.action = {
        action: 'send-link',
        label: c.status === 'link_sent' ? 'Resend link' : 'Send link',
        clientId: c.id,
        disabled: !state.linked
      };
    }
    return row;
  }

  function matchesSearch(c, needle) {
    if (!needle) return true;
    var hay = [c.client_name, c.project_name, c.client_email].join(' ').toLowerCase();
    return hay.indexOf(needle) !== -1;
  }

  function filteredClients() {
    var needle = state.search.trim().toLowerCase();
    return state.clients.filter(function (c) {
      if (state.filterStatus !== 'all' && c.status !== state.filterStatus) return false;
      return matchesSearch(c, needle);
    });
  }

  function findClient(id) {
    for (var i = 0; i < state.clients.length; i++) {
      if (state.clients[i].id === id) return state.clients[i];
    }
    return null;
  }

  /* ---------------- rendering ---------------- */

  function renderCounts() {
    var linksSent = state.clients.filter(function (c) { return c.status === 'link_sent'; }).length;
    setFieldAll('links-sent', linksSent);
    setFieldAll('total-clients', state.clients.length);
  }

  function renderTable() {
    var d = dash();
    if (!state.available) { d.renderEmptyClientsTable(COPY.unavailable); return; }
    if (!state.clients.length) { d.renderEmptyClientsTable(COPY.empty); return; }
    var rows = filteredClients().map(toRow);
    if (!rows.length) { d.renderEmptyClientsTable(COPY.noMatch); return; }
    d.renderClientsTable(rows);
  }

  // Under the table, only while the account is not linked.
  function renderNote() {
    var note = field('clients-note');
    var wanted = state.received && state.available && !state.linked;
    if (!note) {
      if (!wanted) return;
      var wrap = document.querySelector('.client-table-wrap');
      if (!wrap || !wrap.parentNode) return;
      note = document.createElement('p');
      note.className = 'row-actions-note';
      note.setAttribute('data-field', 'clients-note');
      note.style.marginTop = '16px';
      wrap.parentNode.insertBefore(note, wrap.nextSibling);
    }
    note.textContent = COPY.notLinked;
    note.hidden = !wanted;
  }

  function render() {
    if (state.available) renderCounts();
    renderTable();
    renderNote();
  }

  /* ---------------- feedback: modal + banner ---------------- */

  var MODAL_AUTO_CLOSE_MS = 1800;
  var modalTimer = null;
  var focusBeforeModal = null;
  // One request at a time. The modal already covers the page; this also
  // stops a keyboard Enter from starting a second one behind it.
  var busy = false;

  // The banner keeps the last result on the page after the modal is gone.
  function setStatus(text, kind) {
    var el = document.getElementById('clients-status');
    if (!el) return;
    el.textContent = text || '';
    el.setAttribute('data-kind', kind || 'ok');
  }

  // state: 'busy' holds the page, 'ok' closes itself, 'error' waits for Close.
  function showModal(modalState, title, text) {
    var modal = document.getElementById('clients-modal');
    if (!modal) return;
    clearTimeout(modalTimer);
    if (modal.hidden) focusBeforeModal = document.activeElement;
    var close = modal.querySelector('[data-modal-close]');
    modal.setAttribute('data-state', modalState);
    modal.querySelector('#clients-modal-title').textContent = title;
    modal.querySelector('#clients-modal-text').textContent = text || '';
    close.hidden = modalState !== 'error';
    modal.hidden = false;
    if (modalState === 'error') close.focus();
    if (modalState === 'ok') modalTimer = setTimeout(hideModal, MODAL_AUTO_CLOSE_MS);
  }

  function hideModal() {
    var modal = document.getElementById('clients-modal');
    if (!modal || modal.hidden) return;
    clearTimeout(modalTimer);
    modal.hidden = true;
    if (focusBeforeModal && document.contains(focusBeforeModal)) focusBeforeModal.focus();
    focusBeforeModal = null;
  }

  function succeed(title, text) {
    showModal('ok', title, text);
    setStatus(text, 'ok');
  }

  function fail(title, text) {
    showModal('error', title, text);
    setStatus(text, 'error');
  }

  function wireModal() {
    var modal = document.getElementById('clients-modal');
    if (!modal) return;
    modal.querySelector('[data-modal-close]').addEventListener('click', hideModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !busy) hideModal();
    });
  }

  // One dashboard-data answer. A payload without `clients` (an older BFF)
  // is left to dashboard.js, which renders the sales on its own.
  function apply(detail) {
    var data = detail && detail.data;
    if (!data) {
      state.received = true;
      state.available = false;
      render();
      return;
    }
    if (!Array.isArray(data.clients)) return;
    state.received = true;
    state.available = true;
    state.linked = data.linked === true;
    state.clients = data.clients.slice();
    state.commissions = data.commissions || [];
    render();
  }

  /* ---------------- calling the functions ---------------- */

  function getAccessToken() {
    var sb = window.dpSupabase;
    if (!sb || !sb.auth || !sb.auth.getSession) return Promise.reject(new Error('no supabase client'));
    return sb.auth.getSession().then(function (res) {
      var session = res && res.data && res.data.session;
      if (!session || !session.access_token) throw new Error('no session');
      return session.access_token;
    });
  }

  // -> { status, body } where body is the parsed JSON or {}.
  function callFunction(url, payload) {
    return getAccessToken().then(function (token) {
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
      });
    }).then(function (res) {
      return res.text().then(function (text) {
        var body = {};
        try { body = text ? JSON.parse(text) : {}; } catch (e) { body = {}; }
        return { status: res.status, body: body };
      });
    });
  }

  /* ---------------- send link ---------------- */

  function sendErrorText(res) {
    if (res.status === 429) return COPY.rateLimited;
    if (res.status === 409 && res.body && res.body.code === 'not_linked') return COPY.notLinked;
    if (res.status === 503) return COPY.emailNotConfigured;
    return (res.body && res.body.message) || COPY.sendFailed;
  }

  function sendLink(span) {
    if (busy) return;
    if (span.getAttribute('aria-disabled') === 'true') {
      fail(COPY.titleNotLinked, COPY.notLinked);
      return;
    }
    var id = span.getAttribute('data-client-id');
    var client = findClient(id);
    if (!client) return;

    busy = true;
    showModal('busy', COPY.titleSending, COPY.sendingTo + client.client_email + '.');

    callFunction(SEND_URL, { client_id: id }).then(function (res) {
      busy = false;
      if (res.status === 200) {
        client.status = 'link_sent';
        client.link_sent_at = res.body.link_sent_at || new Date().toISOString();
        client.link_sent_count = Number(res.body.link_sent_count) || (Number(client.link_sent_count) || 0) + 1;
        render();
        succeed(COPY.titleSent, COPY.sent + client.client_email + '.');
        return;
      }
      render();
      fail(COPY.titleNotSent, sendErrorText(res));
    }).catch(function () {
      busy = false;
      render();
      fail(COPY.titleNotSent, COPY.sendFailed);
    });
  }

  function wireSendLink() {
    document.addEventListener('click', function (e) {
      var span = e.target.closest('[data-action="send-link"]');
      if (!span) return;
      e.preventDefault();
      e.stopPropagation();
      sendLink(span);
    });
  }

  /* ---------------- add client ---------------- */

  function signedIn() {
    return !!(window.DP_AUTH && window.DP_AUTH.user);
  }

  function formPayload(form) {
    var payload = {};
    new FormData(form).forEach(function (value, key) {
      payload[key] = typeof value === 'string' ? value.trim() : value;
    });
    return payload;
  }

  function clientFromAdded(body) {
    return {
      id: body.id,
      client_name: body.client_name || '',
      project_name: body.project_name || null,
      client_email: body.client_email || null,
      status: 'added',
      link_sent_at: null,
      link_sent_count: 0,
      plan_number: null,
      months_remaining: null,
      plan_registration_id: null
    };
  }

  function addErrorText(res) {
    if (res.status === 409) return COPY.duplicate;
    if (res.status === 400) return (res.body && res.body.message) || COPY.saveFailed;
    return (res.body && res.body.message) || COPY.saveFailed;
  }

  function wireAddForm() {
    var form = document.getElementById('add-client-form');
    if (!form) return;
    var formStatus = document.getElementById('add-client-status');
    var submit = form.querySelector('button[type="submit"]');

    function say(text) {
      if (formStatus) formStatus.textContent = text || '';
    }

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="add-client"]');
      if (!btn) return;
      e.preventDefault();
      if (!signedIn()) return;
      form.hidden = !form.hidden;
      if (!form.hidden) {
        var first = form.querySelector('[name="client_name"]');
        if (first) first.focus();
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      if (!signedIn()) { say(COPY.notSignedIn); return; }
      var payload = formPayload(form);
      if (!payload.client_name || !payload.client_email) { say(COPY.required); return; }

      // A refusal is shown in the modal and left next to the form, so it is
      // still there once the modal is closed and the form is being corrected.
      function refuse(text) {
        say(text);
        fail(COPY.titleNotSaved, text);
      }

      busy = true;
      if (submit) submit.disabled = true;
      say('');
      showModal('busy', COPY.titleSaving, COPY.savingName + payload.client_name + '.');

      callFunction(ADD_URL, payload).then(function (res) {
        busy = false;
        if (submit) submit.disabled = false;
        if (res.status !== 201) { refuse(addErrorText(res)); return; }
        var added = clientFromAdded(res.body);
        state.clients.unshift(added);
        form.reset();
        form.hidden = true;
        if (state.available) render();
        succeed(COPY.titleSaved, COPY.added + added.client_name + '.' + (state.available ? '' : COPY.addedReload));
      }).catch(function () {
        busy = false;
        if (submit) submit.disabled = false;
        refuse(COPY.saveFailed);
      });
    });
  }

  /* ---------------- filters ---------------- */

  function wireFilters() {
    var select = document.querySelector('select[data-action="filter-status"]');
    if (select) {
      select.innerHTML = '';
      STATUS_OPTIONS.forEach(function (pair) {
        var opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        select.appendChild(opt);
      });
      select.addEventListener('change', function () {
        state.filterStatus = select.value || 'all';
        if (state.available) renderTable();
      });
    }
    var search = document.querySelector('input[data-action="filter-search"]');
    if (search) {
      search.addEventListener('input', function () {
        state.search = search.value || '';
        if (state.available) renderTable();
      });
    }
  }

  /* ---------------- boot ---------------- */

  function start() {
    if (!field('clients-table') || !dash()) return;
    wireFilters();
    wireModal();
    wireSendLink();
    wireAddForm();
    document.addEventListener('dp-dashboard-data', function (e) { apply(e.detail); });
    if (dash().lastData) apply(dash().lastData);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
