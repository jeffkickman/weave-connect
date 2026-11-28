/* Weave Time v8 — admin Receipts tab: company card charges with person/date filters and status + review note. */
(function () {
  'use strict';
  var A = window.WTApp, W = window.WTAdmin; if (!A || !W) return;
  var esc = A.esc, st = W.st, rc = st.rcpt = { email: '', date: '', status: '', test: false, list: null, users: null, counts: {}, loading: false, err: '' };
  var STAT = ['new', 'reviewed', 'flagged'];
  function load() {
    rc.loading = true; rc.err = '';
    var q = { status: rc.status, email: rc.email, include_test: !!rc.test };
    if (rc.date) q.date = rc.date;
    W.call('admin_receipts', q).then(function (j) { rc.loading = false; rc.list = j.items || []; rc.counts = j.counts || {}; if (st.tab === 'receipts') W.draw(); },
      function (e) { rc.loading = false; rc.list = []; rc.err = e.message; if (st.tab === 'receipts') W.draw(); });
  }
  function people() {
    var m = {};
    (rc.list || []).forEach(function (x) { m[x.employee_email] = x.employee_name || x.employee_email; });
    (st.users || []).forEach(function (u) { m[u.email] = u.full_name || u.email; });
    return Object.keys(m).sort().map(function (e) { return { email: e, name: m[e] }; });
  }
  function when(iso) { var ms = Date.parse(iso); return isNaN(ms) ? '' : new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT'; }
  function card(x) {
    return '<div class="ad-card"' + (x.is_test ? ' style="border:2px dashed #a32020"' : '') + '><div class="ad-row"><b class="ad-grow">$' + esc(x.amount) + ' · ' + esc(x.merchant) + '</b>' +
      (x.is_test ? '<span class="pill p-bad">TEST</span>' : '') + '<span class="pill ' + (x.status === 'reviewed' ? 'p-on' : x.status === 'flagged' ? 'p-bad' : 'p-lunch') + '">' + esc(x.status) + '</span></div>' +
      '<div>' + esc(x.employee_name) + ' · ' + esc(x.employee_email) + '</div>' +
      '<div class="muted">Charge ' + esc(x.charge_date) + ' · submitted ' + esc(when(x.submitted_at_utc)) + ' · card ••••' + esc(x.card_last4) + ' · ' + esc(x.receipt_id) + '</div>' +
      '<div><b>' + esc(x.job_property) + '</b> — ' + esc(x.purpose) + (x.note ? ' (“' + esc(x.note) + '”)' : '') + '</div>' +
      '<div class="ad-row" style="margin-top:.3rem">' + ((x.photo_urls || []).length ? x.photo_urls.map(function (u, i) { return '<a class="btn-s" target="_blank" rel="noopener" href="' + esc(u) + '">Photo ' + (i + 1) + '</a>'; }).join('') : '<span class="muted">No photo</span>') + '</div>' +
      '<form class="ad-row" data-rcform="' + esc(x.receipt_id) + '" style="margin-top:.35rem"><select name="status" style="width:auto">' + STAT.map(function (s) { return '<option' + (s === x.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input name="note" class="ad-grow" maxlength="1000" placeholder="Review note" value="' + esc(x.review_note || '') + '"><button class="ghost btn-s" type="submit">Save</button></form>' +
      (x.reviewed_by ? '<div class="muted">Reviewed by ' + esc(x.reviewed_by) + ' · ' + esc(when(x.reviewed_at_utc)) + '</div>' : '') + '</div>';
  }
  W.views.receipts = function () {
    if (!rc.list && !rc.loading) setTimeout(load, 0);
    var c = rc.counts || {};
    return '<div class="ad-row"><input type="date" id="rcDate" value="' + esc(rc.date) + '" style="width:auto">' +
      '<select id="rcWho" style="width:auto"><option value="">All people</option>' + people().map(function (p) { return '<option value="' + esc(p.email) + '"' + (p.email === rc.email ? ' selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
      '<select id="rcStatus" style="width:auto"><option value="">All statuses</option>' + STAT.map(function (s) { return '<option value="' + s + '"' + (s === rc.status ? ' selected' : '') + '>' + s + (c[s] ? ' (' + c[s] + ')' : '') + '</option>'; }).join('') + '</select>' +
      '<label style="margin:0"><input type="checkbox" id="rcTest" style="width:auto"' + (rc.test ? ' checked' : '') + '> Include TEST</label>' +
      '<button class="ghost btn-s" type="button" id="rcReload">Refresh</button></div>' +
      '<p class="muted">Company card receipts from cardholders. Photos open in a new tab (private Drive). Status and your note are for review; staff see the status, not the note.</p>' +
      (rc.err ? '<p class="err">' + esc(rc.err) + '</p>' : '') + (rc.loading && !rc.list ? '<p class="muted">Loading…</p>' : '') +
      ((rc.list || []).map(card).join('') || (rc.list && !rc.err ? '<p class="muted">No receipts' + (rc.date || rc.email || rc.status ? ' for these filters' : '') + '.</p>' : ''));
  };
  document.addEventListener('change', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'receipts') return; var t = ev.target;
    if (t.id === 'rcDate') { rc.date = t.value; rc.list = null; load(); }
    if (t.id === 'rcWho') { rc.email = t.value; rc.list = null; load(); }
    if (t.id === 'rcStatus') { rc.status = t.value; rc.list = null; load(); }
    if (t.id === 'rcTest') { rc.test = t.checked; rc.list = null; load(); }
  });
  document.addEventListener('click', function (ev) { if (A.currentScreen() === 'admin' && st.tab === 'receipts' && ev.target.id === 'rcReload') load(); });
  document.addEventListener('submit', function (ev) {
    var f = ev.target; if (!f.dataset || !f.dataset.rcform) return; ev.preventDefault();
    W.call('admin_receipt_set', { id: f.dataset.rcform, status: f.elements.status.value, note: f.elements.note.value.trim() }).then(function () { A.flash('Saved.'); load(); }, W.fail);
  });
})();
