/* Weave Time — Jeff's admin view (role = admin): shell, Live, Week. Timeline / Punches / Employees are in admin-more.js.
   Only rendered for admin sessions; every admin call is re-checked by the server (role + session). */
(function () {
  'use strict';
  var A = window.WTApp, X = window.WTA, S = A.settings, $ = function (id) { return document.getElementById(id); }, esc = A.esc;
  var TABS = [['live', 'Live'], ['week', 'Week'], ['timeline', 'Timeline'], ['punches', 'Punches'], ['employees', 'Employees'], ['routes', 'Routes'], ['undelivered', 'Undelivered'], ['suggestions', 'Suggestions'], ['testdrv', 'Test (clock + driver)']];
  var st = { tab: 'live', live: null, liveAt: 0, week: null, weekStart: '', users: null }, views = {}, mapsP = null, timer = null;
  var css = document.createElement('style');
  css.textContent = 'body.wide main{max-width:980px}body.wide .flash{pointer-events:none;opacity:.96}#adTabs{display:flex;gap:.3rem;flex-wrap:wrap;margin:.5rem 0}#adTabs button{flex:1 1 30%;width:auto;min-width:5.5rem;padding:.55rem .4rem;font-size:.9rem}.ad-row button,.ad-row a{width:auto}' +
    '.ad-card{background:#fff;border-radius:12px;padding:.8rem .9rem;margin:.6rem 0;box-shadow:0 1px 2px rgba(0,0,0,.06)}.ad-row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}' +
    '.ad-row>*{flex:0 0 auto}.ad-grow{flex:1 1 12rem!important}.pill{display:inline-block;border-radius:999px;padding:.1rem .55rem;font-size:.78rem;font-weight:700;background:#eee;color:#5c6570}' +
    '.p-on{background:#e3f1e4;color:#1b5e20}.p-lunch,.p-break{background:#fff4d6;color:#7a5c12}.p-off{background:#eee;color:#5c6570}.p-bad{background:#f9e3e3;color:#a32020}' +
    '.ad-map{height:320px;border-radius:12px;margin:.6rem 0;background:#e9e4da}.ad-tbl{width:100%;border-collapse:collapse;font-size:.85rem}.ad-tbl th,.ad-tbl td{border-bottom:1px solid #eee;padding:.35rem .3rem;text-align:left;vertical-align:top}' +
    '.ad-tbl td.n,.ad-tbl th.n{text-align:right}.ad-scroll{overflow-x:auto}.btn-s{padding:.45rem .7rem;font-size:.85rem;min-height:2.4rem;border-radius:9px}.ad-f label{margin-top:.4rem}' +
    '.ad-f input,.ad-f select,.ad-f textarea{width:100%}a.btn-s{display:inline-block;text-decoration:none;border:1px solid #cfc8bb;color:#0B1F3A;background:#fff}';
  document.head.appendChild(css);

  function call(action, body) {
    var s = A.db().session || {}, b = { action: action, appKey: S.PUNCH_APP_KEY, sessionToken: s.token };
    for (var k in body || {}) b[k] = body[k];
    return A.api(b).then(function (j) {
      if (!j.ok && j.authError) { A.authLost(); throw new Error('Please sign in again.'); }
      if (!j.ok) throw new Error(j.error === 'forbidden' ? 'Not allowed.' : /Unknown action|unknown_admin/i.test(j.error || '') ? 'The Weave Time server needs the latest update (redeploy the Apps Script).' : (j.error || 'Request failed.'));
      return j;
    });
  }
  function pill(state) { var t = { on: 'On the clock', lunch: 'At lunch', 'break': 'On break', off: 'Off' }[state] || state; return '<span class="pill p-' + esc(state) + '">' + esc(t) + '</span>'; }
  function onsitePill(s) { return s === 'onsite' ? '<span class="pill p-on">Onsite</span>' : s === 'offsite' ? '<span class="pill p-bad">Offsite</span>' : '<span class="pill">No location</span>'; }
  function mapsBtn(link, label) { return link ? '<a class="btn-s" target="_blank" rel="noopener" href="' + esc(link) + '">' + esc(label || 'Google Maps') + '</a>' : ''; }
  function fail(e) { A.flash(e && e.message ? e.message : 'Could not reach the Weave Time server.', true); }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  // Leaflet (OpenStreetMap) loaded on first use; if it can't load, the lists still work.
  function leaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (mapsP) return mapsP;
    mapsP = new Promise(function (res, rej) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(l);
      var s = document.createElement('script'); s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.onload = function () { window.L ? res(window.L) : rej(); }; s.onerror = function () { mapsP = null; rej(); };
      document.head.appendChild(s); setTimeout(rej, 10000);
    });
    return mapsP;
  }
  function drawMap(el, markers, line) {
    if (!el || !markers.length) { if (el) el.hidden = true; return; }
    leaflet().then(function (L) {
      if (el._map) el._map.remove();
      var m = L.map(el, { scrollWheelZoom: false }); el._map = m;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(m);
      var pts = markers.map(function (k) { L.circleMarker([k.lat, k.lng], { radius: 7, color: k.color || '#0B1F3A', fillOpacity: .8 }).addTo(m).bindPopup(esc(k.label)); return [k.lat, k.lng]; });
      if (line && pts.length > 1) L.polyline(pts, { color: '#C4A35A', weight: 4 }).addTo(m);
      if (pts.length === 1) m.setView(pts[0], 15); else m.fitBounds(pts, { padding: [24, 24] });
    }, function () { el.hidden = true; });
  }

  // ===== Live =====
  function loadLive() {
    if (st.liveLoading) return Promise.resolve(); st.liveLoading = true;
    return call('admin_dashboard').then(function (j) { st.liveLoading = false; st.live = j; st.liveAt = Date.now(); if (st.tab === 'live') draw(); }, function (e) { st.liveLoading = false; fail(e); });
  }
  views.live = function () {
    var d = st.live; if (!d) return '<p class="muted">Loading…</p>';
    var c = X.stateCounts(d.people), on = d.people.filter(function (p) { return p.state !== 'off'; }), off = d.people.filter(function (p) { return p.state === 'off'; });
    var card = function (p) {
      var l = p.location, where = l ? esc(l.location_description || (l.latitude + ', ' + l.longitude)) : '';
      return '<div class="ad-card"><div class="ad-row"><b class="ad-grow">' + esc(p.full_name) + (p.employee_id ? ' <span class="muted">· ' + esc(p.employee_id) + '</span>' : '') + '</b>' + (p.is_test ? '<span class="pill p-bad">TEST shift</span>' : '') + pill(p.state) + '</div>' +
        '<div class="muted">' + (p.since_utc ? 'Since ' + esc(X.ctTime(p.since_utc)) + ' · ' : '') + 'Today ' + p.today_hours.toFixed(2) + ' h · Week ' + p.week_hours.toFixed(2) + ' h</div>' +
        (l ? '<div class="ad-row" style="margin-top:.35rem">' + onsitePill(l.onsite_status) + '<span class="ad-grow">' + where + (l.distance_m !== '' ? ' <span class="muted">(' + esc(l.distance_m) + ' m from office)</span>' : '') +
          '<br><span class="muted">' + (l.source === 'punch' ? 'From last punch' : 'Live update') + ' · ' + X.ageLabel(l.age_seconds) + (l.accuracy_m ? ' · ±' + esc(l.accuracy_m) + ' m' : '') + '</span></span>' + mapsBtn(l.maps_link) + '</div>'
          : (p.state !== 'off' ? '<div class="muted">No location yet.</div>' : '')) +
        (p.last_punch && p.last_punch.note ? '<div class="note">“' + esc(p.last_punch.note) + '”</div>' : '') +
        (p.issues && p.issues.length ? '<div class="muted" style="color:#a32020">' + esc(p.issues.join('; ')) + '</div>' : '') +
        '<div class="ad-row" style="margin-top:.4rem"><button class="ghost btn-s" data-goto-tl="' + esc(p.email) + '" data-sid="' + esc(p.session_id || '') + '" type="button">Timeline</button></div></div>';
    };
    var g = d.guests_today || [];
    return '<div class="ad-row"><b class="ad-grow">' + c.on + ' working · ' + c.lunch + ' lunch · ' + c['break'] + ' break · ' + c.off + ' off</b>' +
      '<span class="muted">Updated ' + esc(X.ctTime(new Date(st.liveAt).toISOString())) + '</span><button class="ghost btn-s" id="adRefresh" type="button">Refresh</button></div>' +
      '<div class="ad-map" id="liveMap"></div>' +
      '<p class="muted">Location updates every few minutes while the employee\'s app is open; otherwise it shows the location of their last punch.</p>' +
      (on.map(card).join('') || '<p class="muted">Nobody is on the clock right now.</p>') +
      (g.length ? '<h2>Guest punches today</h2>' + g.map(function (x) { return '<div class="ad-card"><b>' + esc(x.employee_name) + '</b> <span class="pill p-bad">GUEST</span> ' + esc(x.punch_type) + ' · ' + esc(X.ctTime(x.timestamp_utc)) + ' ' + onsitePill(x.onsite_status) + ' ' + mapsBtn(x.maps_link) + '<div class="note">' + esc(x.guest_note) + '</div></div>'; }).join('') : '') +
      (off.length ? '<h2>Off the clock</h2><div class="ad-card">' + off.map(function (p) { return '<div class="ad-row"><span class="ad-grow">' + esc(p.full_name) + '</span><span class="muted">Week ' + p.week_hours.toFixed(2) + ' h</span></div>'; }).join('') + '</div>' : '');
  };
  function afterLive() {
    if (!st.live) return;
    var mk = st.live.people.filter(function (p) { return p.location && p.location.latitude !== ''; }).map(function (p) {
      return { lat: +p.location.latitude, lng: +p.location.longitude, label: p.full_name + ' — ' + (p.location.location_description || ''), color: p.state === 'on' ? '#1b5e20' : '#C4A35A' }; });
    drawMap($('liveMap'), mk, false);
  }

  // ===== Week =====
  function loadWeek(ws) {
    st.week = null; st.weekLoading = true; if (st.tab === 'week') draw();
    return call('admin_week_report', { week_start: ws || '', include_test: !!st.weekTest, role_filter: st.weekRole || '' }).then(function (j) { st.weekLoading = false; st.week = j; st.weekStart = j.week_start_sun; if (st.tab === 'week') draw(); },
      function (e) { st.weekLoading = false; fail(e); });
  }
  views.week = function () {
    var r = st.week; if (!r) { if (!st.weekLoading) setTimeout(function () { loadWeek(st.weekStart); }, 0); return '<p class="muted">Loading…</p>'; }
    var dates = r.employees[0] ? r.employees[0].days.map(function (d) { return d.date; }) : [];
    var rows = r.employees.map(function (e) {
      var flags = (e.shiftOpen ? '<span class="pill p-lunch">open</span> ' : '') + (e.offsite.length ? '<span class="pill p-bad">' + e.offsite.length + ' offsite</span> ' : '') + (e.edited.length ? '<span class="pill">' + e.edited.length + ' edited</span>' : '');
      var det = e.offsite.map(function (o) { return '<div class="note">Offsite ' + esc(o.type) + ' ' + esc(o.local_time_ct) + ': “' + esc(o.note) + '” ' + mapsBtn(o.maps_link, 'Map') + '</div>'; }).join('') +
        e.edited.map(function (o) { return '<div class="note">Edited ' + esc(o.type) + ' ' + esc(o.local_time_ct) + ' by ' + esc(o.edited_by) + ': ' + esc(o.edit_reason) + '</div>'; }).join('') +
        (e.issues && e.issues.length ? '<div class="note" style="color:#a32020">' + esc(e.issues.join('; ')) + '</div>' : '');
      return '<tr><td><b>' + esc(e.full_name) + '</b><br><span class="muted">' + esc(e.employee_id) + (e.roles ? ' · ' + esc(e.roles.join(', ')) : '') + '</span> ' + flags + det + '</td>' +
        e.days.map(function (d) { return '<td class="n">' + (d.netHours ? d.netHours.toFixed(2) : '–') + '</td>'; }).join('') +
        '<td class="n"><b>' + e.netHours.toFixed(2) + '</b></td><td class="n">' + e.lunchMinutes + '</td><td class="n">' + e.breakMinutes + '</td></tr>';
    }).join('');
    var guests = (r.guests || []).map(function (g) { return '<tr><td>' + esc(g.employee_name) + ' <span class="pill p-bad">GUEST</span></td><td>' + esc(g.punch_type) + '</td><td>' + esc(g.local_time_ct) + '</td><td>' + esc(g.guest_note) + (g.note ? ' — ' + esc(g.note) : '') + '</td></tr>'; }).join('');
    return '<div class="ad-row"><button class="ghost btn-s" data-wk="-7" type="button">‹ Prev</button><b class="ad-grow" style="text-align:center">Week ' + esc(A.dayLabel(r.week_start_sun)) + ' – ' + esc(A.dayLabel(r.week_end_sat)) + '</b>' +
      '<button class="ghost btn-s" data-wk="7" type="button">Next ›</button></div>' +
      '<div class="ad-row" style="margin:.5rem 0"><button class="go btn-s" id="csvHours" type="button">Download hours CSV</button><button class="ghost btn-s" id="csvPunches" type="button">Download punches CSV</button><label style="margin:0"><input type="checkbox" id="wkTest" style="width:auto"' + (st.weekTest ? ' checked' : '') + '> Include TEST shifts</label>' +
      (r.roles_catalog ? '<select id="wkRole" style="width:auto"><option value="">All roles</option>' + r.roles_catalog.map(function (x) { return '<option' + (x === st.weekRole ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' : '') + '</div>' +
      (st.weekTest ? '<div class="banner">Including TEST shifts — not for payroll.</div>' : '') +
      '<div class="ad-card ad-scroll"><table class="ad-tbl"><tr><th>Employee</th>' + dates.map(function (d) { return '<th class="n">' + esc(A.dayLabel(d).split(',')[0]) + '</th>'; }).join('') +
      '<th class="n">Net h</th><th class="n">Lunch m</th><th class="n">Break m</th></tr>' + (rows || '<tr><td colspan="11" class="muted">No employees yet.</td></tr>') + '</table>' +
      '<p class="muted">Central time, Sun–Sat. Lunch unpaid (subtracted); breaks paid (included).</p></div>' +
      (guests ? '<h2>Guest punches</h2><div class="ad-card ad-scroll"><table class="ad-tbl"><tr><th>Name</th><th>Punch</th><th>Time</th><th>Note</th></tr>' + guests + '</table></div>' : '');
  };

  // ===== shell =====
  function draw() {
    var e = A.me() || {}; $('adName').textContent = (e.full_name || e.email || '') + ' · Admin';
    $('adTabs').innerHTML = TABS.map(function (t) { return '<button type="button" data-adtab="' + t[0] + '" class="' + (t[0] === st.tab ? 'navy' : 'ghost') + '">' + t[1] + '</button>'; }).join('');
    var b = $('adBody'), scrollY = window.scrollY; b.innerHTML = views[st.tab] ? views[st.tab]() : '';
    if (st.tab === 'live') afterLive();
    if (views[st.tab + 'After']) views[st.tab + 'After']();
    window.scrollTo(0, scrollY);
  }
  function goTab(t) { st.tab = t; if (t === 'live') loadLive(); draw(); }
  document.addEventListener('change', function (ev) { if (ev.target.id === 'wkRole' && A.currentScreen() === 'admin') { st.weekRole = ev.target.value; loadWeek(st.weekStart); } });
  document.addEventListener('click', function (ev) {
    if (A.currentScreen() !== 'admin') return;
    var t = ev.target.closest('[data-adtab]'); if (t) return goTab(t.dataset.adtab);
    var p = ev.target.closest('[data-proxy]'); if (p) return $(p.dataset.proxy).click();
    if (ev.target.id === 'adRefresh') return loadLive();
    var w = ev.target.closest('[data-wk]'); if (w && st.week) { st.weekStart = X.addDays(st.week.week_start_sun, +w.dataset.wk); return loadWeek(st.weekStart); }
    if (ev.target.id === 'wkTest') { st.weekTest = ev.target.checked; return loadWeek(st.weekStart); }
    var tx = (st.weekRole ? '-' + st.weekRole : '') + (st.weekTest ? '-INCLUDING-TEST' : '');
    if (ev.target.id === 'csvHours' && st.week) return download('weave-time-hours-' + st.week.week_start_sun + tx + '.csv', X.weekCsv(st.week));
    if (ev.target.id === 'csvPunches' && st.week) return call('admin_punches', { week_start: st.week.week_start_sun }).then(function (j) { download('weave-time-punches-' + st.week.week_start_sun + tx + '.csv', X.punchesCsv(j.punches.filter(function (p) { return st.weekTest || p.is_test !== 'TRUE'; }))); }, fail);
    var g = ev.target.closest('[data-goto-tl]'); if (g && window.WTAdmin.openTimeline) return window.WTAdmin.openTimeline(g.dataset.gotoTl, g.dataset.sid);
  });
  var lastSc = '';
  A.on('render', function (sc) {   // redraw only on entering the admin screen, so app-level re-renders never wipe a half-filled form
    document.body.classList.toggle('wide', sc === 'admin');
    var entering = sc === 'admin' && lastSc !== 'admin'; lastSc = sc;
    if (sc !== 'admin') { clearInterval(timer); timer = null; if (sc === 'login') { st.live = st.week = st.users = null; st.tab = 'live'; } return; }
    if (!timer) timer = setInterval(function () { if (st.tab === 'live' && document.visibilityState !== 'hidden' && A.currentScreen() === 'admin') loadLive(); }, 60000);
    if (entering) { draw(); if (st.tab === 'live') loadLive(); }
  });
  window.WTAdmin = { st: st, views: views, call: call, draw: draw, goTab: goTab, fail: fail, pill: pill, onsitePill: onsitePill, mapsBtn: mapsBtn, drawMap: drawMap, download: download };
  if (A.currentScreen && A.db().session) A.render();
})();
