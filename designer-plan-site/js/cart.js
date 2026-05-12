/* ============================================================
   cart.js — slide-in cart for designer-plan-site
   - Persists in localStorage (key: dp_cart_v1)
   - Reads window.DP_AUTH (from auth.js) to render commission
     when the visitor is an approved partner
   - Triggered by any element with [data-add-to-cart]
   - data-plan, data-name, data-price-cents required on triggers
   ============================================================ */
(function(){
  'use strict';

  var STORAGE_KEY = 'dp_cart_v1';

  function read() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }
  function write(items) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) {}
  }
  function dollars(cents) {
    return '$' + (cents / 100).toFixed(2);
  }

  var els = {};
  function $(id) { return document.getElementById(id); }

  function partnerInfo() {
    var a = window.DP_AUTH || {};
    return a.partner ? a.partner : null;
  }

  function render() {
    var items = read();
    var partner = partnerInfo();
    var rate = partner ? partner.commission_rate : 0;

    // count badge
    els.count.textContent = String(items.length);
    els.count.hidden = items.length === 0;

    // banners
    if (partner) {
      els.partnerBanner.hidden = false;
      els.guestBanner.hidden = true;
      els.commissionRate.textContent = Math.round(rate * 100) + '%';
    } else {
      els.partnerBanner.hidden = true;
      els.guestBanner.hidden = false;
    }

    // items
    els.items.innerHTML = '';
    if (items.length === 0) {
      els.empty.hidden = false;
      els.items.hidden = true;
      els.checkout.disabled = true;
    } else {
      els.empty.hidden = true;
      els.items.hidden = false;
      els.checkout.disabled = false;
      items.forEach(function(it, idx) {
        var li = document.createElement('li');
        li.className = 'cart-item';
        var lineCommission = Math.round(it.price_cents * rate);
        li.innerHTML =
          '<p class="cart-item-name">' + escapeHtml(it.name) + '</p>' +
          '<p class="cart-item-price">' + dollars(it.price_cents) + '</p>' +
          (partner ? '<p class="cart-item-commission">Your commission: ' + dollars(lineCommission) + '</p>' : '') +
          '<button type="button" class="cart-item-remove" data-remove="' + idx + '">Remove</button>';
        els.items.appendChild(li);
      });
    }

    // totals
    var subtotal = items.reduce(function(s, it) { return s + it.price_cents; }, 0);
    els.subtotal.textContent = dollars(subtotal);
    var totalCommission = Math.round(subtotal * rate);
    els.commission.textContent = dollars(totalCommission);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function(c){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function open() {
    els.drawer.hidden = false;
    els.backdrop.hidden = false;
    requestAnimationFrame(function(){
      els.drawer.classList.add('open');
      els.backdrop.classList.add('open');
    });
    els.drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    els.drawer.classList.remove('open');
    els.backdrop.classList.remove('open');
    els.drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(function(){
      els.drawer.hidden = true;
      els.backdrop.hidden = true;
    }, 280);
  }

  function add(plan) {
    var items = read();
    // de-dupe by plan slug — keep one of each
    if (items.some(function(it){ return it.plan === plan.plan; })) {
      render();
      open();
      return;
    }
    items.push(plan);
    write(items);
    render();
    open();
  }

  function remove(idx) {
    var items = read();
    items.splice(idx, 1);
    write(items);
    render();
  }

  function init() {
    els.drawer = $('cart-drawer');
    els.backdrop = $('cart-backdrop');
    els.trigger = $('cart-trigger');
    els.closeBtn = $('cart-close');
    els.count = $('cart-count');
    els.items = $('cart-items');
    els.empty = $('cart-empty');
    els.subtotal = $('cart-subtotal');
    els.checkout = $('cart-checkout');
    els.partnerBanner = $('cart-partner-banner');
    els.guestBanner = $('cart-guest-banner');
    els.commission = $('cart-commission');
    els.commissionRate = $('cart-commission-rate');

    if (!els.drawer) return; // no cart on this page

    els.trigger.addEventListener('click', function(){ render(); open(); });
    els.closeBtn.addEventListener('click', close);
    els.backdrop.addEventListener('click', close);
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && els.drawer.classList.contains('open')) close();
    });

    // Add-to-cart triggers
    document.querySelectorAll('[data-add-to-cart]').forEach(function(btn){
      btn.addEventListener('click', function(){
        add({
          plan: btn.dataset.plan,
          name: btn.dataset.name,
          price_cents: parseInt(btn.dataset.priceCents, 10) || 0
        });
      });
    });

    // Remove buttons (event-delegated since items re-render)
    els.items.addEventListener('click', function(e){
      var btn = e.target.closest('[data-remove]');
      if (!btn) return;
      remove(parseInt(btn.dataset.remove, 10));
    });

    // Checkout stub — dev team wires real backend
    els.checkout.addEventListener('click', function(){
      var items = read();
      var partner = partnerInfo();
      // POST to the stub function so the dev team can plug in checkout
      fetch('/.netlify/functions/cart-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items,
          partner_id: partner ? partner.id : null
        })
      }).then(function(r){ return r.json(); })
        .then(function(data){
          if (data && data.checkout_url) {
            window.location.href = data.checkout_url;
          } else {
            alert('Checkout is in development. Your items are saved in your cart.');
          }
        })
        .catch(function(){
          alert('Checkout is in development. Your items are saved in your cart.');
        });
    });

    // Re-render when auth state resolves (real wiring path)
    document.addEventListener('dp-auth-ready', render);

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
