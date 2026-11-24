/* Weave Time — admin Routes tab (today / by week, start + finish numbers, Atlas post status, CSV, audited edits)
   and the "Test driver" tab (the driver Start/End Route form; the server stores everything from an admin as TEST). */
(function () {
  'use strict';
  var A = window.WTApp, W = window.WTAdmin, D = window.WTD, X = window.WTA; if (!W || !D) return;
  var esc = A.esc, st = W.st, rt = st.rt = { mode: 'today', week: '', test: false, list: null, loading: false, err: '', editing: '' };
  var $ = function (id) { return document.getElementById(id); };
  function load() {
    rt.loading = true; rt.err = ''; var b = { include_test: rt.test };
    if (rt.mode === 'today') b.date = WT.dateKey(Date.now()); else b.week_start = rt.week || WT.weekStart(Date.now());
    W.call('admin_routes', b).then(function (j) { rt.loading = false; rt.list = j.routes; rt.from = j.from; rt.to = j.to; rt.allow = j.allow_test; if (st.tab === 'routes') W.draw(); },
      function (e) { rt.loading = false; rt.list = []; rt.err = e.message; if (st.tab === 'routes') W.draw(); });
  }
  function post(r, k) {
    var s = r[k + '_post_status']; if (!s) return '<span class="pill">' + (k === 'end' ? 'not finished' : '—') + '</span>';
    return '<span class="pill ' + (s === 'posted' ? 'p-on' : s === 'test' ? 'p-bad' : 'p-lunch') + '">' + esc(k === 'start' ? 'Start: ' : 'End: ') + esc(D.postLabel(s)) + '</span>' +
      (s === 'posted' ? ' <span class="muted">' + esc(X.ctTime(r[k + '_posted_at_utc'])) + ' by ' + esc(r[k + '_posted_by']) + '</span>' : '');
  }
  function n(v) { return v === '' || v == null ? '–' : esc(v); }
  function card(r) {
    if (rt.editing === r.route_id) return editForm(r);
    var fin = r.status === 'finished', acc = fin ? (+r.delivered_packages) + (+r.returned_packages) + (+(r.missing_packages || 0)) : 0;
    return '<div class="ad-card"' + (r.is_test ? ' style="border:2px dashed #a32020"' : '') + '><div class="ad-row"><b class="ad-grow">' + esc(r.employee_name) + ' · ' + esc(r.route_name) + '</b>' +
      (r.is_test ? '<span class="pill p-bad">TEST</span>' : '') + '<span class="pill ' + (fin ? 'p-off' : 'p-on') + '">' + (fin ? 'finished' : 'on route') + '</span></div>' +
      '<div class="muted">' + esc(A.dayLabel(r.date_ct)) + ' · ' + esc(r.vehicle) + '</div>' +
      '<div><b>Start</b> ' + esc(X.ctTime(r.started_at_utc)) + ' · mileage ' + n(r.start_odometer) + ' · <b>' + n(r.start_packages) + '</b> packages' + (r.totes_text ? ' · totes ' + esc(r.totes_text) : '') +
      (r.oversize_count !== '' && r.oversize_count != null ? ' · oversize ' + n(r.oversize_count) : '') + ' · overflow ' + n(r.overflow_count) + (r.start_stops !== '' ? ' · ' + esc(r.start_stops) + ' stops' : '') + '</div>' +
      (fin ? '<div><b>Finish</b> ' + esc(X.ctTime(r.finished_at_utc)) + ' · mileage ' + n(r.end_odometer) + ' · <b>' + n(r.miles) + ' mi</b> · delivered <b>' + n(r.delivered_packages) + '</b> · returned ' + n(r.returned_packages) +
        (r.returned_reasons ? ' (' + esc(r.returned_reasons) + ')' : '') + ' · missing ' + n(r.missing_packages) + ' · damaged ' + n(r.damaged_packages) +
        (r.successful_stops !== '' ? ' · stops ' + esc(r.successful_stops) + ' ok / ' + n(r.unsuccessful_stops) + ' problem' : '') + '</div>' +
        (acc !== +r.start_packages ? '<div style="color:#a32020;font-weight:600">Count difference: ' + acc + ' accounted for, ' + esc(r.start_packages) + ' started (' + (acc - r.start_packages) + ')</div>' : '') : '') +
      (r.start_note ? '<div class="note">Start: “' + esc(r.start_note) + '”</div>' : '') + (r.end_note ? '<div class="note">Finish: “' + esc(r.end_note) + '”</div>' : '') +
      (r.edited_by ? '<div class="muted">Edited by ' + esc(r.edited_by) + ': ' + esc(r.edit_reason) + '</div>' : '') +
      '<div class="ad-row" style="margin-top:.35rem">' + post(r, 'start') + post(r, 'end') + '<button class="ghost btn-s" type="button" data-rtedit="' + esc(r.route_id) + '">Edit</button></div>' +
      '<details><summary class="muted">Post text</summary><pre style="white-space:pre-wrap;font-size:.8rem">' + esc(r.end_post_text || r.start_post_text) + '</pre></details></div>';
  }
  var EDIT = [['route_name', 'Route'], ['vehicle', 'Vehicle'], ['start_odometer', 'Start mileage'], ['start_packages', 'Start packages'], ['overflow_count', 'Overflow'], ['start_stops', 'Start stops'],
    ['end_odometer', 'End mileage', 1], ['delivered_packages', 'Delivered', 1], ['returned_packages', 'Returned', 1], ['returned_reasons', 'Returned reasons', 1], ['missing_packages', 'Missing', 1], ['damaged_packages', 'Damaged', 1],
    ['successful_stops', 'Successful stops', 1], ['unsuccessful_stops', 'Problem stops', 1], ['end_note', 'Finish note', 1]];
  function editForm(r) {
    return '<form class="ad-card ad-f" data-rtform="' + esc(r.route_id) + '"><b>Edit ' + esc(r.employee_name) + ' · ' + esc(r.route_name) + '</b>' +
      EDIT.filter(function (f) { return !f[2] || r.status === 'finished'; }).map(function (f) { return '<label>' + f[1] + '</label><input name="' + f[0] + '" value="' + esc(r[f[0]]) + '">'; }).join('') +
      (r.is_test ? '<p class="muted">TEST route (cannot be changed to real).</p>' : '<label><input type="checkbox" name="is_test" style="width:auto"> Mark as TEST (never posted, not counted)</label>') +
      '<label>Reason for the change (required)</label><input name="edit_reason" required minlength="3" maxlength="300">' +
      '<div class="row"><button class="ghost" type="button" data-rtcancel="1">Cancel</button><button class="go" type="submit">Save</button></div></form>';
  }
  W.views.routes = function () {
    if (!rt.list && !rt.loading) setTimeout(load, 0);
    var real = (rt.list || []).filter(function (r) { return !r.is_test; }), by = {};
    real.forEach(function (r) { var b = by[r.employee_name] = by[r.employee_name] || { routes: 0, miles: 0, del: 0 }; b.routes++; b.miles += +r.miles || 0; b.del += +r.delivered_packages || 0; });
    var tot = Object.keys(by).sort().map(function (k) { return '<tr><td>' + esc(k) + '</td><td class="n">' + by[k].routes + '</td><td class="n">' + by[k].miles.toFixed(1) + '</td><td class="n">' + by[k].del + '</td></tr>'; }).join('');
    return '<div class="ad-row"><button type="button" class="btn-s ' + (rt.mode === 'today' ? 'navy' : 'ghost') + '" data-rtmode="today">Today</button><button type="button" class="btn-s ' + (rt.mode === 'week' ? 'navy' : 'ghost') + '" data-rtmode="week">Week</button>' +
      (rt.mode === 'week' ? '<button class="ghost btn-s" type="button" data-rtwk="-7">‹</button><b>' + (rt.from ? esc(A.dayLabel(rt.from)) + ' – ' + esc(A.dayLabel(rt.to)) : '') + '</b><button class="ghost btn-s" type="button" data-rtwk="7">›</button>' : '') +
      '<label style="margin:0"><input type="checkbox" id="rtTest" style="width:auto"' + (rt.test ? ' checked' : '') + '> Include TEST routes</label>' +
      '<button class="ghost btn-s" type="button" id="rtReload">Refresh</button><button class="go btn-s" type="button" id="rtCsv">Download routes CSV</button></div>' +
      (rt.allow === false ? '<p class="muted">Test mode is off on the server (ALLOW_TEST_ROUTES=false): every route counts as real.</p>' : '') +
      (rt.err ? '<p class="err">' + esc(rt.err) + '</p>' : '') + (rt.loading && !rt.list ? '<p class="muted">Loading…</p>' : '') +
      (tot ? '<div class="ad-card ad-scroll"><table class="ad-tbl"><tr><th>Driver (real routes)</th><th class="n">Routes</th><th class="n">Miles</th><th class="n">Delivered</th></tr>' + tot + '</table></div>' : '') +
      ((rt.list || []).map(card).join('') || (rt.list && !rt.err ? '<p class="muted">No routes ' + (rt.mode === 'today' ? 'today' : 'this week') + (rt.test ? '' : ' (TEST routes hidden)') + '.</p>' : ''));
  };
  W.views.testdrv = function () { return '<div class="card" id="drvPreview" data-drvbox="preview"></div>'; };
  W.views.testdrvAfter = function () { if (window.WTDriver) window.WTDriver.mount('drvPreview', true); };
  document.addEventListener('click', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'routes') return; var t = ev.target, d = t.dataset || {};
    if (d.rtmode) { rt.mode = d.rtmode; rt.list = null; return load(); }
    if (d.rtwk) { rt.week = X.addDays(rt.from || WT.weekStart(Date.now()), +d.rtwk); rt.list = null; return load(); }
    if (t.id === 'rtTest') { rt.test = t.checked; rt.list = null; return load(); }
    if (t.id === 'rtReload') return load();
    if (t.id === 'rtCsv') return W.download('weave-time-routes-' + (rt.from || '') + (rt.mode === 'week' ? '-week' : '') + (rt.test ? '-INCLUDING-TEST' : '') + '.csv', D.routesCsv(rt.list || []));
    if (d.rtedit) { rt.editing = d.rtedit; return W.draw(); }
    if (d.rtcancel) { rt.editing = ''; return W.draw(); }
  });
  document.addEventListener('submit', function (ev) {
    var f = ev.target; if (!f.dataset || !f.dataset.rtform) return; ev.preventDefault();
    var u = {}; EDIT.forEach(function (x) { if (f.elements[x[0]]) u[x[0]] = f.elements[x[0]].value.trim(); }); u.is_test = f.elements.is_test.checked;
    W.call('admin_route_edit', { route_id: f.dataset.rtform, edit_reason: f.elements.edit_reason.value.trim(), updates: u })
      .then(function () { rt.editing = ''; A.flash('Route updated.'); load(); }, W.fail);
  });
})();
