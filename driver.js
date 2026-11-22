/* Weave Time — driver screens: Start Route (after Clock In) and End Route. Drafts live on the phone (localStorage) and
   route posts queue offline like punches. Admins get the same form as a "Test driver screen" that only writes TEST rows. */
(function () {
  'use strict';
  var A = window.WTApp, D = window.WTD; if (!A || !D) return;
  var $ = function (id) { return document.getElementById(id); }, esc = A.esc, S = A.settings;
  var allowTest = true, busy = false, lastToday = 0, mounts = {};
  function db() { var d = A.db(); d.routes = d.routes || []; d.routeDrafts = d.routeDrafts || {}; return d; }
  function me() { return A.me() || {}; }
  function draft() { var d = db(), k = me().email || '?'; d.routeDrafts[k] = d.routeDrafts[k] || { start: { totes: [{}, {}, {}] }, finish: {} }; return d.routeDrafts[k]; }
  function mine() { var e = me().email; return db().routes.filter(function (r) { return r.email === e; }); }
  function isOpen(r) { return !r.finish || r.finishSync === 'error'; }
  function today(r) { return r.startedAt && WT.dateKey(Date.parse(r.startedAt)) === WT.dateKey(Date.now()); }
  function onClock() { return WT.stateOf(WT.forOwner(db().punches, me().email)) !== 'off'; }
  function inp(f, v, label, mode, ph) { return '<label>' + label + '</label><input data-f="' + f + '" value="' + esc(v == null ? '' : v) + '" inputmode="' + (mode || 'numeric') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + ' autocomplete="off">'; }
  function sel(f, v, opts, other, label) {
    return '<label>' + label + '</label><select data-f="' + f + '"><option value="">Choose…</option>' + opts.concat(['Other']).map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>' +
      (v === 'Other' ? '<input data-f="' + f + 'Other" value="' + esc(other || '') + '" placeholder="Type it" autocomplete="off">' : '');
  }
  function syncText(s, err) { return s === 'synced' ? '<span class="tag on">saved</span>' : s === 'waiting' ? '<span class="tag na">on phone — waiting for server update</span>' : s === 'error' ? '<span class="tag off">' + esc(err || 'not saved') + '</span>' : '<span class="tag na">on phone — sending…</span>'; }
  function startForm(preview) {
    var f = draft().start, w = D.startWarnings(f);
    return '<h2>Start Route</h2>' + (preview ? '<div class="banner">Test driver screen — everything you save here is stored as TEST and is never posted.</div>' : '') +
      '<p class="muted">Fill this in before you leave, from your notebook / Flex screen.</p>' +
      sel('route', f.route, D.ROUTES, f.routeOther, 'Route') + sel('vehicle', f.vehicle, D.VEHICLES, f.vehicleOther, 'Vehicle') +
      inp('start_odometer', f.start_odometer, 'Starting mileage (odometer)', 'decimal', 'e.g. 74029.1') + inp('start_packages', f.start_packages, 'Total packages') +
      '<label>Totes / bags (color or label + packages in it)</label>' + (f.totes || []).map(function (t, i) {
        return '<div class="row"><input data-tote="' + i + '" data-k="label" value="' + esc(t.label || '') + '" placeholder="e.g. Black 473" autocomplete="off"><input data-tote="' + i + '" data-k="packages" value="' + esc(t.packages || '') + '" inputmode="numeric" placeholder="pkgs" style="max-width:6rem"></div>'; }).join('') +
      '<button class="ghost sm" type="button" data-drv="addtote">+ Add tote</button>' +
      inp('oversize_count', f.oversize_count, 'Oversize (count)') + inp('overflow_count', f.overflow_count, 'Overflow / loose bags (count)') + inp('start_stops', f.start_stops, 'Stops on Flex (optional)') +
      '<label>Note (optional)</label><textarea data-f="start_note" rows="2" maxlength="500">' + esc(f.start_note || '') + '</textarea>' +
      (allowTest && !preview ? '<label>Real route or Test? (required)</label><div class="row">' + ['real', 'test'].map(function (m) {
        return '<label style="flex:1;margin:0;padding:.7rem;border:1px solid #d7d1c6;border-radius:10px;font-size:1rem;color:#1a1a1a"><input type="radio" name="drvMode" data-f="mode" value="' + m + '"' + (f.mode === m ? ' checked' : '') + ' style="width:auto"> ' + (m === 'real' ? 'Real route' : 'Test') + '</label>'; }).join('') + '</div>' : '') +
      '<p class="muted" data-live style="color:#8a6d1f">' + esc(w.join(' ')) + '</p><p class="err" data-err hidden></p>' +
      '<button class="go big" type="button" data-drv="start">Start Route</button>';
  }
  function endForm(r) {
    var g = draft().finish, s = r.start, m = D.miles(s.start_odometer, g.end_odometer), c = D.finishCheck(g, s);
    return '<h2>End Route — ' + esc(s.route_name) + (s.is_test ? ' <span class="tag off">TEST</span>' : '') + '</h2>' +
      '<p class="muted">Started ' + esc(A.shortTime(r.startedAt)) + ' · ' + esc(s.vehicle) + ' · start mileage ' + esc(s.start_odometer) + ' · ' + esc(s.start_packages) + ' packages ' + syncText(r.startSync, r.err) + '</p>' +
      (r.finishSync === 'error' ? '<p class="err">' + esc(r.err || 'Not saved') + '</p>' : '') +
      inp('end_odometer', g.end_odometer, 'Ending mileage (odometer)', 'decimal') + '<p class="muted" data-miles>' + (m != null ? m + ' miles driven' : '') + '</p>' +
      inp('delivered_packages', g.delivered_packages, 'Packages delivered') + inp('returned_packages', g.returned_packages, 'Packages returned / undelivered (0 if none)') +
      (D.whole(g.returned_packages) > 0 ? '<label>Why did they come back?</label><input data-f="returned_reasons" value="' + esc(g.returned_reasons || '') + '" placeholder="e.g. business closed, no access, wrong address" autocomplete="off">' : '') +
      inp('missing_packages', g.missing_packages, 'Missing packages (optional)') + inp('damaged_packages', g.damaged_packages, 'Damaged packages (optional)') +
      inp('successful_stops', g.successful_stops, 'Successful stops on Flex (optional)') + inp('unsuccessful_stops', g.unsuccessful_stops, 'Unsuccessful / problem stops (optional)') +
      '<label>Notes (optional; required if anything is missing or damaged)</label><textarea data-f="end_note" rows="2" maxlength="800">' + esc(g.end_note || '') + '</textarea>' +
      '<p class="muted" data-live>' + (c ? 'Check: ' + esc(c.text) : '') + '</p><p class="err" data-err hidden></p>' +
      '<button class="go big" type="button" data-drv="finish">Finish Route</button>';
  }
  function doneList(preview) {
    var rs = mine().filter(function (r) { return today(r) && (!isOpen(r) || r.startSync === 'error') && !!r.preview === !!preview; });
    if (!rs.length) return '';
    return '<h2 style="margin-top:1rem">Today’s routes</h2><ul class="pl">' + rs.map(function (r) {
      var sv = r.server || {}, t = sv.end_post_text || sv.start_post_text || '';
      return '<li><b>' + esc(r.start.route_name) + '</b>' + (r.start.is_test ? ' <span class="tag off">TEST</span>' : '') + ' · ' + esc(A.shortTime(r.startedAt)) + (r.finishedAt ? '–' + esc(A.shortTime(r.finishedAt)) : '') +
        (sv.miles ? ' · ' + esc(sv.miles) + ' mi' : '') + ' ' + syncText(r.finishSync || r.startSync, r.err) + (sv.end_post_status ? ' <span class="muted">' + esc(D.postLabel(sv.end_post_status)) + '</span>' : '') +
        (r.startSync === 'error' ? '<div class="row"><button class="ghost sm" type="button" data-drv="edit" data-cid="' + esc(r.cid) + '">Fix &amp; resend</button><button class="ghost sm" type="button" data-drv="discard" data-cid="' + esc(r.cid) + '">Discard</button></div>' : '') +
        (t ? '<details><summary class="muted">What gets posted</summary><pre style="white-space:pre-wrap;font-size:.8rem">' + esc(t) + '</pre></details>' : '') + '</li>'; }).join('') + '</ul>';
  }
  function body(preview) {
    var open = mine().filter(function (r) { return isOpen(r) && !!r.preview === !!preview && r.startSync !== 'error'; })[0];
    if (open) return endForm(open) + doneList(preview);
    if (preview || onClock()) return startForm(preview) + doneList(preview);
    return '<h2>Route</h2><p class="muted">Clock in first, then the Start Route form appears here.</p>' +
      (allowTest ? '<label style="font-size:1rem;color:#1a1a1a"><input type="checkbox" id="testShift" style="width:auto"> This is a test shift (practice only, not counted as hours)</label>' : '') + doneList(false);
  }
  function paint(el, preview, force) {
    if (!el) return; var key = JSON.stringify([preview, onClock(), allowTest, mine().map(function (r) { return [r.cid, r.startSync, r.finishSync, !!r.finish, r.server && r.server.end_post_status]; })]);
    if (!force && el.dataset.k === key) return; el.dataset.k = key; el.innerHTML = body(preview);
  }
  function repaint(force) { for (var id in mounts) paint($(id), mounts[id], force); }
  function mount(id, preview) { mounts[id] = !!preview; paint($(id), !!preview, true); refresh(); sync(); }
  function holder(t) { var h = t.closest('[data-drvbox]'); return h ? { el: h, preview: h.dataset.drvbox === 'preview' } : null; }

  function live(el, open, f) {   // update miles / count check / tote warning without redrawing (keeps the keyboard up)
    var o = open && mine().filter(function (r) { return isOpen(r) && r.startSync !== 'error'; })[0], lv = el.querySelector('[data-live]'), mi = el.querySelector('[data-miles]');
    if (!open && lv) lv.textContent = D.startWarnings(f).join(' ');
    if (o && lv) { var c = D.finishCheck(f, o.start); lv.textContent = c ? 'Check: ' + c.text : ''; }
    if (o && mi) { var m = D.miles(o.start.start_odometer, f.end_odometer); mi.textContent = m != null ? m + ' miles driven' : ''; }
  }
  document.addEventListener('input', function (ev) {
    var t = ev.target, h = holder(t); if (!h) return;
    var open = mine().some(function (r) { return isOpen(r) && !!r.preview === h.preview && r.startSync !== 'error'; }), d = draft(), f = open ? d.finish : d.start;
    if (t.dataset.tote) f.totes[+t.dataset.tote][t.dataset.k] = t.value; else if (t.dataset.f) f[t.dataset.f] = t.value;
    A.save(); live(h.el, open, f);
    if (t.tagName === 'SELECT' || (t.dataset.f === 'returned_packages' && (D.whole(f.returned_packages) > 0) !== !!h.el.querySelector('[data-f=returned_reasons]'))) { var y = window.scrollY, f2 = t.dataset.f; paint(h.el, h.preview, true); window.scrollTo(0, y); var n = h.el.querySelector('[data-f="' + f2 + '"]'); if (n && n.tagName === 'INPUT' && n.type !== 'radio') { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch (e) {} } }
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-drv]'); if (!b) return; var h = holder(b); if (!h) return; var a = b.dataset.drv, d = draft();
    var err = function (list) { var p = h.el.querySelector('[data-err]'); if (p) { p.textContent = list.join(' '); p.hidden = !list.length; } if (list.length) A.flash(list[0], true); };
    if (a === 'addtote') { d.start.totes.push({}); A.save(); return paint(h.el, h.preview, true); }
    if (a === 'start') {
      var e = D.validateStart(d.start, allowTest, h.preview); if (e.length) return err(e);
      var r = { cid: D.newRouteId(window.crypto), email: me().email, preview: h.preview, startedAt: new Date().toISOString(), start: D.startPayload(d.start, allowTest, h.preview), startSync: 'pending', finish: null };
      db().routes.push(r); d.start = { totes: [{}, {}, {}], vehicle: d.start.vehicle, vehicleOther: d.start.vehicleOther }; d.finish = {}; A.save();
      A.flash('Route started at ' + A.shortTime(r.startedAt) + (r.start.is_test ? ' (TEST)' : '') + '.'); paint(h.el, h.preview, true); return sync();
    }
    if (a === 'finish') {
      var o = mine().filter(function (x) { return isOpen(x) && !!x.preview === h.preview && x.startSync !== 'error'; })[0]; if (!o) return;
      var e2 = D.validateFinish(d.finish, o.start); if (e2.length) return err(e2);
      o.finish = D.finishPayload(d.finish); o.finishedAt = new Date().toISOString(); o.finishSync = 'pending'; o.err = ''; d.finish = {}; A.save();
      var m = D.miles(o.start.start_odometer, o.finish.end_odometer); A.flash('Route finished — ' + m + ' miles.'); paint(h.el, h.preview, true); return sync();
    }
    var rr = mine().filter(function (x) { return x.cid === b.dataset.cid; })[0]; if (!rr) return;
    if (a === 'discard' && !window.confirm('Discard this route? It was not saved on the server.')) return;
    db().routes.splice(db().routes.indexOf(rr), 1);
    if (a === 'edit') { var s = rr.start; d.start = { route: D.ROUTES.indexOf(s.route_name) >= 0 ? s.route_name : 'Other', routeOther: s.route_name, vehicle: D.VEHICLES.indexOf(s.vehicle) >= 0 ? s.vehicle : 'Other', vehicleOther: s.vehicle,
      start_odometer: s.start_odometer, start_packages: s.start_packages, totes: s.totes.length ? s.totes : [{}], oversize_count: s.oversize_count, overflow_count: s.overflow_count, start_stops: s.start_stops, start_note: s.start_note, mode: s.is_test ? 'test' : 'real' }; if (rr.finish) d.finish = rr.finish; }
    A.save(); repaint(true);
  });

  function call(body) { var s = db().session || {}; body.appKey = S.PUNCH_APP_KEY; body.sessionToken = s.token; return A.api(body); }
  function canSend() { var s = db().session; return s && !s.authNeeded && !s.mustChangePassword && A.endpointReady() && (me().role === 'driver' || me().role === 'admin'); }
  function handle(r, j, kind) {
    if (j.ok) { r.server = j.route; r.route_id = j.route.route_id; r[kind + 'Sync'] = 'synced'; r.err = ''; return true; }
    if (j.authError) { A.authLost(); return false; }
    if (/Unknown action/i.test(j.error || '')) { r[kind + 'Sync'] = 'waiting'; return false; }
    if (j.mustChangePassword) return false;
    r[kind + 'Sync'] = 'error'; r.err = j.error || 'Not saved'; if (kind === 'finish') draft().finish = Object.assign({}, r.finish); A.flash('Route not saved: ' + r.err, true); return true;
  }
  function sync() {
    if (busy || !canSend()) return Promise.resolve(); busy = true;
    var jobs = [];
    mine().forEach(function (r) {
      jobs.push(function () {
        if (r.startSync === 'synced' || r.startSync === 'error') return true;
        return call(Object.assign({ action: 'route_start', client_route_id: r.cid, started_at_utc: r.startedAt }, r.start)).then(function (j) { return handle(r, j, 'start'); });
      });
      jobs.push(function () {
        if (!r.finish || r.startSync !== 'synced' || r.finishSync === 'synced' || r.finishSync === 'error') return true;
        return call(Object.assign({ action: 'route_finish', route_id: r.route_id, client_route_id: r.cid, finished_at_utc: r.finishedAt }, r.finish)).then(function (j) { return handle(r, j, 'finish'); });
      });
    });
    var chain = Promise.resolve(true);
    jobs.forEach(function (job) { chain = chain.then(function (ok) { return ok ? Promise.resolve(job()).catch(function () { return false; }) : false; }); });
    return chain.then(fin, fin);
    function fin() { busy = false; A.save(); repaint(); }
  }
  function refresh() {   // learn allow_test and post status; recover an open route if this phone lost it
    if (!canSend() || Date.now() - lastToday < 30000) return; lastToday = Date.now();
    call({ action: 'route_today' }).then(function (j) {
      if (!j.ok) return; allowTest = j.allow_test !== false;
      (j.routes || []).forEach(function (sv) {
        var r = mine().filter(function (x) { return x.cid === sv.client_route_id; })[0];
        if (!r) { r = { cid: sv.client_route_id, email: me().email, preview: me().role === 'admin', startedAt: sv.started_at_utc, startSync: 'synced', route_id: sv.route_id,
          start: { route_name: sv.route_name, vehicle: sv.vehicle, start_odometer: sv.start_odometer, start_packages: sv.start_packages, totes: [], is_test: sv.is_test }, finish: null }; db().routes.push(r); }
        r.server = sv; r.route_id = sv.route_id; if (sv.status === 'finished' && !r.finish) { r.finish = {}; r.finishSync = 'synced'; r.finishedAt = sv.finished_at_utc; }
      });
      var wk = Date.now() - 8 * 864e5; db().routes = db().routes.filter(function (r) { return Date.parse(r.startedAt) > wk || isOpen(r) || r.startSync !== 'synced' || (r.finish && r.finishSync !== 'synced'); });
      A.save(); repaint();
    }, function () {});
  }
  A.on('render', function (sc) {
    var el = $('drvCard'); if (!el) return;
    var show = sc === 'app' && me().role === 'driver'; el.hidden = !show; if (show) { mounts.drvCard = false; paint(el, false); refresh(); }
  });
  A.on('visible', function () { lastToday = 0; refresh(); sync(); });
  window.addEventListener('online', function () { sync(); });
  setInterval(function () { sync(); }, 60000);
  window.WTDriver = { mount: mount, sync: sync, refresh: function () { lastToday = 0; refresh(); },
    testShift: function () { var c = $('testShift'); return !!(c && c.checked && allowTest && me().role === 'driver'); } };
})();
