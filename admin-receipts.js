/* Weave Time v9 — admin Receipts tab: payment/card-check filters, Cards sub-view, reimbursement actions. */
(function () {
  'use strict';
  var A = window.WTApp, W = window.WTAdmin; if (!A || !W) return;
  var esc = A.esc, st = W.st, rc = st.rcpt = { email: '', date: '', status: '', pay: '', check: '', test: false, view: 'receipts', list: null, cards: null, counts: {}, loading: false, err: '', edit: '' };
  var STAT = ['new', 'reviewed', 'flagged'], PAY = [['company', 'Company card'], ['personal', 'My own money'], ['unsure', 'Not sure']];
  var CHK = ['match_assigned', 'company_card_other_holder', 'card_closed_or_inactive', 'unknown_last4', 'amex_loose', 'personal', 'unsure'];
  var CST = ['active', 'closing', 'closed', 'lost'], REIMB = ['owed', 'paid', 'denied'];
  function load() {
    rc.loading = true; rc.err = '';
    var q = { status: rc.status, email: rc.email, include_test: !!rc.test, payment_type: rc.pay, card_check: rc.check };
    if (rc.date) q.date = rc.date;
    W.call('admin_receipts', q).then(function (j) { rc.loading = false; rc.list = j.items || []; rc.counts = j.counts || {}; if (st.tab === 'receipts') W.draw(); },
      function (e) { rc.loading = false; rc.list = []; rc.err = e.message; if (st.tab === 'receipts') W.draw(); });
  }
  function loadCards() {
    rc.loading = true; rc.err = '';
    W.call('admin_company_cards', {}).then(function (j) { rc.loading = false; rc.cards = j.items || []; if (st.tab === 'receipts') W.draw(); },
      function (e) { rc.loading = false; rc.cards = []; rc.err = e.message; if (st.tab === 'receipts') W.draw(); });
  }
  function people() {
    var m = {};
    (rc.list || []).forEach(function (x) { m[x.employee_email] = x.employee_name || x.employee_email; });
    (st.users || []).forEach(function (u) { m[u.email] = u.full_name || u.email; });
    return Object.keys(m).sort().map(function (e) { return { email: e, name: m[e] }; });
  }
  function when(iso) { var ms = Date.parse(iso); return isNaN(ms) ? '' : new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT'; }
  function card(x) {
    return '<div class="ad-card"' + (x.is_test || x.status === 'flagged' ? ' style="border:2px dashed #a32020"' : '') + '><div class="ad-row"><b class="ad-grow">$' + esc(x.amount) + ' · ' + esc(x.merchant) + '</b>' +
      (x.is_test ? '<span class="pill p-bad">TEST</span>' : '') + '<span class="pill ' + (x.status === 'reviewed' ? 'p-on' : x.status === 'flagged' ? 'p-bad' : 'p-lunch') + '">' + esc(x.status) + '</span></div>' +
      '<div>' + esc(x.employee_name) + ' · ' + esc(x.employee_email) + '</div>' +
      '<div class="muted">Charge ' + esc(x.charge_date) + ' · ' + esc(x.payment_type || '') + (x.paid_with ? ' / ' + esc(x.paid_with) : '') + (x.card_last4 ? ' · ••' + esc(x.card_last4) : '') + ' · ' + esc(x.card_check || '') + (x.matched_card_id ? ' · ' + esc(x.matched_card_id) : '') + ' · ' + esc(x.receipt_id) + '</div>' +
      '<div><b>' + esc(x.job_property) + '</b> — ' + esc(x.purpose) + (x.note ? ' (“' + esc(x.note) + '”)' : '') + '</div>' +
      '<div class="ad-row" style="margin-top:.3rem">' + ((x.photo_urls || []).length ? x.photo_urls.map(function (u, i) { return '<a class="btn-s" target="_blank" rel="noopener" href="' + esc(u) + '">Photo ' + (i + 1) + '</a>'; }).join('') : '<span class="muted">No photo</span>') + '</div>' +
      '<form class="ad-row" data-rcform="' + esc(x.receipt_id) + '" style="margin-top:.35rem"><select name="status" style="width:auto">' + STAT.map(function (s) { return '<option' + (s === x.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input name="note" class="ad-grow" maxlength="1000" placeholder="Review note" value="' + esc(x.review_note || '') + '"><button class="ghost btn-s" type="submit">Save</button></form>' +
      (x.payment_type === 'personal' || x.reimbursement_status ? '<form class="ad-row" data-rcreimb="' + esc(x.receipt_id) + '"><select name="reimbursement_status" style="width:auto">' + REIMB.map(function (s) { return '<option' + (s === (x.reimbursement_status || 'owed') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
        '<input name="reimbursed_at" type="date" style="width:auto" value="' + esc((x.reimbursed_at || '').slice(0, 10)) + '"><input name="reimbursement_note" class="ad-grow" maxlength="1000" placeholder="Reimbursement note" value="' + esc(x.reimbursement_note || '') + '"><button class="ghost btn-s" type="submit">Reimburse</button></form>' : '') +
      (x.reviewed_by ? '<div class="muted">Reviewed by ' + esc(x.reviewed_by) + ' · ' + esc(when(x.reviewed_at_utc)) + '</div>' : '') + '</div>';
  }
  function cardForm(c) {
    c = c || { card_id: '', issuer: '', product: '', last4: '', id_kind: '', holder_name: '', holder_email: '', status: 'active', notes: '' };
    return '<form class="ad-card ad-f" data-ccform="' + esc(c.card_id || 'new') + '"><div class="ad-row"><input name="card_id" required maxlength="80" placeholder="card_id" value="' + esc(c.card_id) + '"' + (c.card_id ? ' readonly' : '') + '>' +
      '<input name="issuer" maxlength="80" placeholder="Issuer" value="' + esc(c.issuer) + '"><input name="product" maxlength="120" placeholder="Product" value="' + esc(c.product) + '"></div>' +
      '<div class="ad-row"><input name="last4" required inputmode="numeric" maxlength="5" placeholder="last 4 or 5" value="' + esc(c.last4) + '">' +
      '<select name="id_kind" style="width:auto"><option value="">id kind (auto)</option><option value="last4"' + (c.id_kind === 'last4' ? ' selected' : '') + '>last4</option><option value="amex_suffix"' + (c.id_kind === 'amex_suffix' ? ' selected' : '') + '>amex_suffix</option></select>' +
      '<select name="status" style="width:auto">' + CST.map(function (s) { return '<option' + (s === (c.status || 'active') ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
      '<div class="ad-row"><input name="holder_name" maxlength="120" placeholder="Holder name" value="' + esc(c.holder_name) + '"><input name="holder_email" type="email" placeholder="Holder email (optional)" value="' + esc(c.holder_email) + '"></div>' +
      '<input name="notes" maxlength="1000" placeholder="Notes" value="' + esc(c.notes || '') + '"><div class="row"><button class="go btn-s" type="submit">Save card</button>' +
      (c.card_id ? '<button class="ghost btn-s" type="button" data-cccancel="1">Cancel</button>' : '') + '</div></form>';
  }
  function cardRow(c) {
    return '<div class="ad-card"><div class="ad-row"><b class="ad-grow">' + esc(c.label || (c.issuer + ' ••' + c.last4)) + '</b><span class="pill ' + (c.status === 'active' ? 'p-on' : c.status === 'closing' ? 'p-lunch' : 'p-bad') + '">' + esc(c.status) + '</span></div>' +
      '<div class="muted">' + esc(c.card_id) + ' · ' + esc(c.id_kind || '') + ' · ' + esc(c.holder_name || '') + (c.holder_email ? ' · ' + esc(c.holder_email) : ' · no Weave email') + '</div>' +
      (c.notes ? '<div>' + esc(c.notes) + '</div>' : '') +
      '<button class="ghost btn-s" type="button" data-ccedit="' + esc(c.card_id) + '">Edit</button></div>';
  }
  W.views.receipts = function () {
    var tabs = '<div class="ad-row"><button class="' + (rc.view === 'receipts' ? 'navy' : 'ghost') + ' btn-s" type="button" id="rcViewR">Receipts</button><button class="' + (rc.view === 'cards' ? 'navy' : 'ghost') + ' btn-s" type="button" id="rcViewC">Cards</button></div>';
    if (rc.view === 'cards') {
      if (!rc.cards && !rc.loading) setTimeout(loadCards, 0);
      var ed = rc.edit ? (rc.cards || []).filter(function (c) { return c.card_id === rc.edit; })[0] : null;
      return tabs + '<p class="muted">Company cards on file (last 4 or Amex 5-digit suffix only — never a full number). The accounting bot usually loads these. No seed data is added here automatically.</p>' +
        (rc.err ? '<p class="err">' + esc(rc.err) + '</p>' : '') + (rc.loading && !rc.cards ? '<p class="muted">Loading…</p>' : '') +
        '<h2>' + (ed ? 'Edit card' : 'Add a card') + '</h2>' + cardForm(ed) + ((rc.cards || []).map(cardRow).join('') || (rc.cards && !rc.err ? '<p class="muted">No company cards on file yet.</p>' : ''));
    }
    if (!rc.list && !rc.loading) setTimeout(load, 0);
    var c = rc.counts || {};
    return tabs + '<div class="ad-row"><input type="date" id="rcDate" value="' + esc(rc.date) + '" style="width:auto">' +
      '<select id="rcWho" style="width:auto"><option value="">All people</option>' + people().map(function (p) { return '<option value="' + esc(p.email) + '"' + (p.email === rc.email ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<select id="rcStatus" style="width:auto"><option value="">All statuses</option>' + STAT.map(function (s) { return '<option value="' + s + '"' + (s === rc.status ? ' selected' : '') + '>' + s + (c[s] ? ' (' + c[s] + ')' : '') + '</option>'; }).join('') + '</select>' +
      '<select id="rcPay" style="width:auto"><option value="">All payments</option>' + PAY.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === rc.pay ? ' selected' : '') + '>' + esc(p[1]) + '</option>'; }).join('') + '</select>' +
      '<select id="rcCheck" style="width:auto"><option value="">All card checks</option>' + CHK.map(function (s) { return '<option value="' + s + '"' + (s === rc.check ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<label style="margin:0"><input type="checkbox" id="rcTest" style="width:auto"' + (rc.test ? ' checked' : '') + '> Include TEST</label>' +
      '<button class="ghost btn-s" type="button" id="rcReload">Refresh</button></div>' +
      '<p class="muted">Receipts from staff. Flagged / unknown last 4 / closed cards need review. Personal receipts start as owed until you mark paid or denied.</p>' +
      (rc.err ? '<p class="err">' + esc(rc.err) + '</p>' : '') + (rc.loading && !rc.list ? '<p class="muted">Loading…</p>' : '') +
      ((rc.list || []).map(card).join('') || (rc.list && !rc.err ? '<p class="muted">No receipts' + (rc.date || rc.email || rc.status || rc.pay || rc.check ? ' for these filters' : '') + '.</p>' : ''));
  };
  document.addEventListener('change', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'receipts') return; var t = ev.target;
    if (t.id === 'rcDate') { rc.date = t.value; rc.list = null; load(); }
    if (t.id === 'rcWho') { rc.email = t.value; rc.list = null; load(); }
    if (t.id === 'rcStatus') { rc.status = t.value; rc.list = null; load(); }
    if (t.id === 'rcPay') { rc.pay = t.value; rc.list = null; load(); }
    if (t.id === 'rcCheck') { rc.check = t.value; rc.list = null; load(); }
    if (t.id === 'rcTest') { rc.test = t.checked; rc.list = null; load(); }
  });
  document.addEventListener('click', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'receipts') return;
    if (ev.target.id === 'rcReload') return rc.view === 'cards' ? loadCards() : load();
    if (ev.target.id === 'rcViewR') { rc.view = 'receipts'; if (!rc.list) load(); else W.draw(); }
    if (ev.target.id === 'rcViewC') { rc.view = 'cards'; rc.edit = ''; if (!rc.cards) loadCards(); else W.draw(); }
    var ed = ev.target.closest('[data-ccedit]'); if (ed) { rc.edit = ed.dataset.ccedit; W.draw(); }
    if (ev.target.dataset && ev.target.dataset.cccancel) { rc.edit = ''; W.draw(); }
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target;
    if (f.dataset && f.dataset.rcform) {
      ev.preventDefault();
      W.call('admin_receipt_set', { id: f.dataset.rcform, status: f.elements.status.value, note: f.elements.note.value.trim() }).then(function () { A.flash('Saved.'); load(); }, W.fail);
    }
    if (f.dataset && f.dataset.rcreimb) {
      ev.preventDefault();
      W.call('admin_reimburse', { id: f.dataset.rcreimb, reimbursement_status: f.elements.reimbursement_status.value, reimbursed_at: f.elements.reimbursed_at.value, reimbursement_note: f.elements.reimbursement_note.value.trim() }).then(function () { A.flash('Reimbursement updated.'); load(); }, W.fail);
    }
    if (f.dataset && f.dataset.ccform) {
      ev.preventDefault();
      var body = { card_id: f.elements.card_id.value.trim(), issuer: f.elements.issuer.value.trim(), product: f.elements.product.value.trim(), last4: f.elements.last4.value.trim(), id_kind: f.elements.id_kind.value, status: f.elements.status.value, holder_name: f.elements.holder_name.value.trim(), holder_email: f.elements.holder_email.value.trim(), notes: f.elements.notes.value.trim() };
      W.call('admin_company_card_set', body).then(function () { A.flash('Card saved.'); rc.edit = ''; rc.cards = null; loadCards(); }, W.fail);
    }
  });
})();
