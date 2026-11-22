/* Weave Time v6 — admin: Undelivered tab (label photos + reasons for Hub disputes, dispute status) and the Test tab additions:
   Test clock (Jeff's punches, always saved as TEST, never payroll), Clear my test punches, and the driver's Undelivered card in test mode. */
(function () {
  'use strict';
  var A = window.WTApp, W = window.WTAdmin, X = window.WTA, O = window.WTOcr; if (!A || !W) return;
  var esc = A.esc, st = W.st, u = st.und = { date: '', route: '', test: false, list: null, loading: false, err: '' };
  var $ = function (id) { return document.getElementById(id); };
  var REASONS = O ? O.REASONS : [];
  function load() {
    u.loading = true; u.err = ''; var d = u.date || WT.dateKey(Date.now());
    W.call('admin_undelivered', { date: d, include_test: u.test }).then(function (j) { u.loading = false; u.list = j.items || []; u.from = j.from; if (st.tab === 'undelivered') W.draw(); },
      function (e) { u.loading = false; u.list = []; u.err = e.message; if (st.tab === 'undelivered') W.draw(); });
  }
  function pill(s) { return '<span class="pill ' + (s === 'resolved' ? 'p-off' : s === 'disputed' ? 'p-on' : s === 'test' ? 'p-bad' : 'p-lunch') + '">' + esc(s || 'pending') + '</span>'; }
  function card(x) {
    return '<div class="ad-card"' + (x.is_test ? ' style="border:2px dashed #a32020"' : '') + '><div class="ad-row"><b class="ad-grow">' + esc(x.tba) + '</b>' + (x.is_test ? '<span class="pill p-bad">TEST</span>' : '') + pill(x.dispute_status) + '</div>' +
      '<div>' + esc(x.employee_name) + ' · ' + esc(x.route_name) + ' · ' + esc(A.dayLabel(x.date_local)) + ' ' + esc(X ? X.ctTime(x.created_utc) : x.created_utc) + '</div>' +
      '<div><b>' + esc(x.reason) + '</b>' + (x.note ? ' — “' + esc(x.note) + '”' : '') + '</div>' +
      '<div class="ad-row" style="margin-top:.3rem">' + (x.photo_url ? '<a class="btn-s" target="_blank" rel="noopener" href="' + esc(x.photo_url) + '">Label photo</a>' : '<span class="muted">' + (x.photo_error ? 'Photo not saved: ' + esc(x.photo_error) : 'No photo') + '</span>') +
      (x.dispute_note ? '<span class="muted">Dispute: ' + esc(x.dispute_note) + (x.updated_by ? ' (' + esc(x.updated_by) + ')' : '') + '</span>' : '') + '</div>' +
      (x.ocr_text ? '<details><summary class="muted">OCR text</summary><pre style="white-space:pre-wrap;font-size:.75rem">' + esc(x.ocr_text) + '</pre></details>' : '') +
      (x.is_test ? '' : '<form class="ad-row" data-undmark="' + esc(x.id) + '" style="margin-top:.3rem"><select name="status" style="width:auto">' + ['pending', 'disputed', 'resolved'].map(function (s) { return '<option' + (s === x.dispute_status ? ' selected' : '') + '>' + s + '</option>'; }).join('') +
        '</select><input name="note" class="ad-grow" placeholder="Case # / note" value="' + esc(x.dispute_note) + '" maxlength="500"><button class="ghost btn-s" type="submit">Save</button></form>') + '</div>';
  }
  function csv(list) {
    var H = ['date_local', 'employee_name', 'route_name', 'tba', 'reason', 'note', 'photo_url', 'dispute_status', 'dispute_note', 'is_test', 'created_utc', 'id'];
    var q = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [H.join(',')].concat(list.map(function (x) { return H.map(function (h) { return q(x[h]); }).join(','); })).join('\n') + '\n';
  }
  W.views.undelivered = function () {
    if (!u.list && !u.loading) setTimeout(load, 0);
    var list = (u.list || []).filter(function (x) { return !u.route || x.route_name === u.route; }), routes = {};
    (u.list || []).forEach(function (x) { routes[x.route_name] = 1; });
    var by = {}; list.forEach(function (x) { if (!x.is_test) by[x.reason] = (by[x.reason] || 0) + 1; });
    return '<div class="ad-row"><input type="date" id="unDate" value="' + esc(u.date || WT.dateKey(Date.now())) + '" style="width:auto">' +
      '<select id="unRoute" style="width:auto"><option value="">All routes</option>' + Object.keys(routes).sort().map(function (r) { return '<option' + (r === u.route ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' +
      '<label style="margin:0"><input type="checkbox" id="unTest" style="width:auto"' + (u.test ? ' checked' : '') + '> Include TEST</label>' +
      '<button class="ghost btn-s" type="button" id="unReload">Refresh</button><button class="go btn-s" type="button" id="unCsv">Download CSV</button></div>' +
      '<p class="muted">Drivers log each package they bring back (label photo + reason). Atlas lists the pending ones for disputes; filing a dispute still goes through your approval.</p>' +
      (u.err ? '<p class="err">' + esc(u.err) + '</p>' : '') + (u.loading && !u.list ? '<p class="muted">Loading…</p>' : '') +
      (Object.keys(by).length ? '<div class="ad-card"><b>By reason (real):</b> ' + Object.keys(by).sort().map(function (k) { return esc(k) + ' ' + by[k]; }).join(' · ') + '</div>' : '') +
      (list.map(card).join('') || (u.list && !u.err ? '<p class="muted">No undelivered packages logged for this day' + (u.test ? '' : ' (TEST hidden)') + '.</p>' : ''));
  };
  document.addEventListener('change', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'undelivered') return; var t = ev.target;
    if (t.id === 'unDate') { u.date = t.value; u.list = null; u.route = ''; load(); }
    if (t.id === 'unRoute') { u.route = t.value; W.draw(); }
    if (t.id === 'unTest') { u.test = t.checked; u.list = null; load(); }
  });
  document.addEventListener('click', function (ev) {
    if (A.currentScreen() !== 'admin') return; var t = ev.target;
    if (st.tab === 'undelivered' && t.id === 'unReload') return load();
    if (st.tab === 'undelivered' && t.id === 'unCsv') return W.download('weave-time-undelivered-' + (u.from || '') + (u.test ? '-INCLUDING-TEST' : '') + '.csv', csv((u.list || []).filter(function (x) { return !u.route || x.route_name === u.route; })));
    if (t.id === 'tcOpen') { A.db().adminTestClock = true; A.save(); return A.render(); }
    if (t.id === 'tcClear') {
      if (!window.confirm('Delete ALL of your TEST punches and their timeline points? Real punches are never touched.')) return;
      return W.call('admin_clear_test_punches', {}).then(function (j) {
        var e = (A.me() || {}).email, d = A.db(); d.punches = (d.punches || []).filter(function (p) { return p.ownerEmail !== e; }); A.save();
        A.flash('Cleared ' + j.punches_deleted + ' test punch(es) and ' + j.points_deleted + ' timeline point(s).');
      }, W.fail);
    }
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target; if (!f.dataset || !f.dataset.undmark) return; ev.preventDefault();
    W.call('admin_undelivered_mark', { id: f.dataset.undmark, status: f.elements.status.value, note: f.elements.note.value.trim() }).then(function () { A.flash('Saved.'); load(); }, W.fail);
  });
  // Test tab: Test clock + driver Undelivered card (test mode)
  var tv = W.views.testdrv, ta = W.views.testdrvAfter;
  W.views.testdrv = function () {
    return '<div class="card"><h2>Test clock</h2><p class="muted">Try the employee clock (clock in, lunch, break, clock out, location while on the clock). Every punch you make is saved as <b>TEST</b>: never in payroll, hours, exports or the Live board.</p>' +
      '<div class="ad-row"><button class="go btn-s" type="button" id="tcOpen">Open Test clock</button><button class="ghost btn-s" type="button" id="tcClear">Clear my test punches</button></div></div>' +
      (tv ? tv() : '') + '<div class="card" id="undPreview" data-undbox="preview" hidden></div>';
  };
  W.views.testdrvAfter = function () { if (ta) ta(); if (window.WTUnd) window.WTUnd.mount('undPreview', true); };
  A.on('render', function (sc) {
    var bar = $('tcBar'), adm = (A.me() || {}).role === 'admin';
    if (sc === 'login' && A.db().adminTestClock) { A.db().adminTestClock = false; A.save(); }
    if (bar) bar.hidden = !(sc === 'app' && adm);
  });
  document.addEventListener('click', function (ev) { if (ev.target.id === 'tcBack') { A.db().adminTestClock = false; A.save(); A.render(); } });
})();
