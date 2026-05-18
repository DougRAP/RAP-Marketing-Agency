/* ============================================================
   dashboard.js — Designer Plan partner dashboard
   - ?preview=1 loads mock data so the page can be viewed before
     Supabase auth is wired.
   - Otherwise calls /.netlify/functions/dashboard-data; if the
     visitor is not authenticated, shows the signed-out state.
   ============================================================ */
(function(){
  'use strict';

  // --- config (dev team: swap when live) ---
  var SITE_ORIGIN   = window.location.origin;
  var SCHEDULER_URL = 'https://calendly.com/designer-plan/onboarding'; // REPLACE-BEFORE-LAUNCH
  var STRIPE_PENDING_MSG = 'Connect Stripe to release your payable commission.';

  function $(id){ return document.getElementById(id); }
  function dollars(c){ return '$' + ((c||0)/100).toFixed(2); }
  function esc(s){
    return String(s==null?'':s).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  // --- mock data for preview mode ---
  var MOCK = {
    name: 'Maren Ellison',
    studio: 'Ellison Interiors',
    account_number: 'DP-10042',
    referral_code: 'ellison-interiors',
    status: 'active',                 // active | pending
    onboarding_step: 3,               // 1..5
    stripe_connected: false,
    success_contact: 'Tasha Reed, Partner Success',
    commission_tracked_cents: 84300,
    commission_payable_cents: 0,
    promo_a_claimed: null,            // or { client_name: 'The Hartleys' }
    activity: [
      { client:'J. Whitman', tier:'Premium Plus', date:'2026-05-09', source:'closeout',     commission_cents:34900, status:'paid' },
      { client:'A. Cole',     tier:'Premium',      date:'2026-05-02', source:'client link',  commission_cents:24900, status:'paid' },
      { client:'R. Diaz',     tier:'Stain',        date:'2026-04-21', source:'closeout',     commission_cents:14900, status:'pending' }
    ]
  };

  // --- onboarding step definitions ---
  var STEPS = [
    { n:1, title:'Account created', desc:'Your partner account is live.' },
    { n:2, title:'Approved', desc:'You are an approved Designer Plan partner.' },
    { n:3, title:'Get your link & start selling', desc:'Copy your client link or grab a QR code and open the toolkit.', action:'sell' },
    { n:4, title:'Schedule your onboarding call', desc:'A 30-minute walkthrough with partner success. Optional, but worth it.', action:'schedule' },
    { n:5, title:'Connect Stripe', desc:'Last step — only needed to receive payouts. Your commission is tracked either way.', action:'stripe' }
  ];

  function clientLink(code){ return SITE_ORIGIN + '/plans?ref=' + encodeURIComponent(code); }
  function referLink(code){  return SITE_ORIGIN + '/partner-apply?ref=' + encodeURIComponent(code); }

  function render(data){
    $('loading-state').hidden = true;
    $('signedout-state').hidden = true;
    $('dash').hidden = false;

    // header
    $('d-name').textContent = data.name || 'Partner';
    $('d-studio').textContent = data.studio || '';
    $('d-account-number').textContent = data.account_number || '—';
    $('d-referral-code').textContent = data.referral_code || '—';
    var badge = $('d-status-badge');
    if (data.status === 'active') { badge.textContent = 'Active partner'; badge.className = 'badge badge-active'; }
    else { badge.textContent = 'Pending'; badge.className = 'badge badge-pending'; }

    // checklist
    var cl = $('checklist');
    cl.innerHTML = '';
    var step = data.onboarding_step || 1;
    STEPS.forEach(function(s){
      var state = s.n < step ? 'done' : (s.n === step ? 'current' : 'todo');
      // step 5 is "done" only if stripe connected
      if (s.n === 5) state = data.stripe_connected ? 'done' : (step >= 5 ? 'current' : 'todo');
      var li = document.createElement('li');
      li.className = 'check-step check-' + state;
      var mark = state === 'done' ? '&#10003;' : s.n;
      var actionHtml = '';
      if (state !== 'done' && s.action === 'sell') {
        actionHtml = '<div class="step-action"><button class="btn btn-primary btn-sm" data-copy="link">Copy client link</button></div>';
      } else if (state !== 'done' && s.action === 'schedule') {
        actionHtml = '<div class="step-action"><button class="btn btn-quiet btn-sm" data-schedule>Schedule call</button></div>';
      } else if (state !== 'done' && s.action === 'stripe') {
        actionHtml = '<div class="step-action"><button class="btn btn-accent btn-sm" data-stripe>Connect Stripe</button></div>';
      }
      li.innerHTML =
        '<div class="check-mark">' + mark + '</div>' +
        '<div class="check-body"><h3>' + esc(s.title) + '</h3><p>' + esc(s.desc) + '</p>' + actionHtml + '</div>';
      cl.appendChild(li);
    });

    // commission
    $('d-commission-tracked').textContent = dollars(data.commission_tracked_cents);
    $('d-commission-payable').textContent = dollars(data.commission_payable_cents);
    $('d-commission-note').textContent = data.stripe_connected ? '' : STRIPE_PENDING_MSG;

    // activity
    var body = $('activity-body');
    body.innerHTML = '';
    var rows = data.activity || [];
    if (rows.length === 0) {
      $('activity-empty').hidden = false;
    } else {
      $('activity-empty').hidden = true;
      rows.forEach(function(r){
        var tr = document.createElement('tr');
        var pill = r.status === 'paid' ? 'pill-ok' : 'pill-pending';
        tr.innerHTML =
          '<td>' + esc(r.client) + '</td>' +
          '<td>' + esc(r.tier) + '</td>' +
          '<td>' + esc(r.date) + '</td>' +
          '<td>' + esc(r.source) + '</td>' +
          '<td>' + dollars(r.commission_cents) + '</td>' +
          '<td><span class="pill ' + pill + '">' + esc(r.status) + '</span></td>';
        body.appendChild(tr);
      });
    }

    // promo A state
    var paState = $('promo-a-state');
    if (data.promo_a_claimed) {
      paState.innerHTML = '<span class="promo-claimed">&#10003; Claimed for ' + esc(data.promo_a_claimed.client_name) + ' — 40% commission applied.</span>';
    } else {
      paState.innerHTML = '<button class="btn btn-accent btn-sm" id="promo-a-claim">Claim this promotion</button>';
    }

    // support
    if (data.success_contact) $('d-success-contact').textContent = data.success_contact;

    // stash for handlers
    window.__DP_DASH = data;
    wireHandlers(data);
  }

  function showSignedOut(){
    $('loading-state').hidden = true;
    $('dash').hidden = true;
    $('signedout-state').hidden = false;
  }

  function copyText(text, btn){
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function(){
        if (btn){ var t = btn.textContent; btn.textContent = 'Copied'; setTimeout(function(){ btn.textContent = t; }, 1400); }
      });
    } else {
      window.prompt('Copy this:', text);
    }
  }

  function wireHandlers(data){
    var code = data.referral_code || '';

    // copy buttons (delegated)
    document.addEventListener('click', function(e){
      var c = e.target.closest('[data-copy]');
      if (!c) return;
      e.preventDefault();
      var kind = c.getAttribute('data-copy');
      if (kind === 'code') copyText(code, c);
      else if (kind === 'link') copyText(clientLink(code), c);
      else if (kind === 'referlink') copyText(referLink(code), c);
    });

    // QR download
    var qr = $('qr-tile');
    if (qr) qr.setAttribute('href',
      'https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=' + encodeURIComponent(clientLink(code)));
    if (qr) { qr.setAttribute('target','_blank'); qr.setAttribute('rel','noopener'); }

    // schedule modal
    var schedOpen = $('sched-open');
    if (schedOpen) schedOpen.setAttribute('href', SCHEDULER_URL);
    function openSchedule(){ $('schedule-modal').classList.add('open'); }
    document.addEventListener('click', function(e){
      if (e.target.closest('[data-schedule]') || e.target.id === 'schedule-tile' || e.target.closest('#schedule-tile') || e.target.id === 'support-schedule') {
        e.preventDefault(); openSchedule();
      }
    });
    $('sched-cancel').addEventListener('click', function(){ $('schedule-modal').classList.remove('open'); });

    // stripe
    document.addEventListener('click', function(e){
      if (e.target.closest('[data-stripe]') || e.target.id === 'stripe-tile' || e.target.closest('#stripe-tile')) {
        e.preventDefault();
        alert('Stripe Connect onboarding is wired by the dev team. Your personalized link arrives by email; this button will open it.');
      }
    });

    // promo A claim
    document.addEventListener('click', function(e){
      if (e.target.id === 'promo-a-claim') { e.preventDefault(); $('promo-a-modal').classList.add('open'); }
    });
    $('pa-cancel').addEventListener('click', function(){ $('promo-a-modal').classList.remove('open'); });
    $('pa-submit').addEventListener('click', function(){
      var name = $('pa-client-name').value.trim();
      if (!name) { $('pa-client-name').focus(); return; }
      var payload = { client_name: name, client_email: $('pa-client-email').value.trim() || null };
      if (isPreview()) {
        $('promo-a-modal').classList.remove('open');
        $('promo-a-state').innerHTML = '<span class="promo-claimed">&#10003; Claimed for ' + esc(name) + ' — 40% commission applied.</span>';
        return;
      }
      fetch('/.netlify/functions/promo-claim', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(Object.assign({ promo:'first-plan-on-us' }, payload))
      }).then(function(r){ return r.json(); }).then(function(){
        $('promo-a-modal').classList.remove('open');
        $('promo-a-state').innerHTML = '<span class="promo-claimed">&#10003; Claimed for ' + esc(name) + ' — 40% commission applied.</span>';
      }).catch(function(){ alert('Could not claim right now. Email designer.programs@raptns.com.'); });
    });

    // toolkit (stub)
    document.addEventListener('click', function(e){
      var t = e.target.closest('[data-toolkit]');
      if (!t) return;
      e.preventDefault();
      var kind = t.getAttribute('data-toolkit');
      if (kind === 'email-copy') {
        copyText('Hi — I’ve set your new pieces up with Designer Plan, 36-month protection. Review and activate here: ' + clientLink(code), t);
      } else if (kind === 'text-copy') {
        copyText('Your Designer Plan coverage: ' + clientLink(code), t);
      } else {
        alert('Toolkit item "' + kind + '" — content drops here before launch.');
      }
    });

    // logout
    var lo = $('logout-link');
    if (lo) lo.addEventListener('click', function(e){
      e.preventDefault();
      // dev team: call supabase.auth.signOut() here
      window.location.href = '/login';
    });
  }

  function isPreview(){
    try { return new URLSearchParams(window.location.search).get('preview') === '1'; }
    catch(e){ return false; }
  }

  // --- boot ---
  if (isPreview()) {
    $('preview-banner').hidden = false;
    render(MOCK);
    return;
  }

  // real path — needs auth + a data function
  fetch('/.netlify/functions/dashboard-data', { credentials:'include' })
    .then(function(r){
      if (r.status === 401 || r.status === 403) { showSignedOut(); return null; }
      if (!r.ok) throw new Error('load failed');
      return r.json();
    })
    .then(function(data){
      if (data) render(data);
    })
    .catch(function(){
      // until dashboard-data + auth are wired, fall back to signed-out
      showSignedOut();
    });

})();
