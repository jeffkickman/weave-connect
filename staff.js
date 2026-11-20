/* Weave Time — app shell: local store, API, punch capture (GPS + onsite check + note gate), sync queues, clock views.
   Location is stored and sent to the private sheet but NEVER shown: employees see only Onsite / Offsite / Location unavailable. */
(function () {
  'use strict';
  var S = window.WT_SETTINGS || {}, C = WT.CONFIG, KEY = 'weavetime.v4';
  var REVERSE_GEOCODE_TIMEOUT_MS = 3000, RETRY_EVERY_MS = 60000, API_TIMEOUT_MS = 20000;
  var $ = function (id) { return document.getElementById(id); };
  var db = load(), view = 'clock', screen = 'login', pendingCapture = null, syncing = false, listeners = [];

  function load() {
    var d; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    d = d || {};
    d.session = d.session || null; d.punches = d.punches || []; d.guestQueue = d.guestQueue || []; d.lastEmail = d.lastEmail || '';
    return d;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
  function endpointReady() { return /^https:\/\//.test(S.PUNCH_ENDPOINT_URL || ''); }
  function api(body) {
    if (!endpointReady()) return Promise.reject(new Error('Weave Time server is not connected yet.'));
    var ctl = window.AbortController ? new AbortController() : null, t = setTimeout(function () { if (ctl) ctl.abort(); }, API_TIMEOUT_MS);
    var opts = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) };
    if (ctl) opts.signal = ctl.signal;
    return fetch(S.PUNCH_ENDPOINT_URL, opts).then(function (r) { return r.json(); })
      .then(function (j) { clearTimeout(t); return j || { ok: false, error: 'Empty reply' }; }, function (e) { clearTimeout(t); throw e; });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hm(min) { min = Math.round(min); return Math.floor(min / 60) + 'h ' + (min % 60 < 10 ? '0' : '') + (min % 60) + 'm'; }
  function shortTime(ts) { return new Date(ts).toLocaleTimeString('en-US', { timeZone: C.TIMEZONE, hour: 'numeric', minute: '2-digit' }); }
  function dayLabel(k) { var a = k.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }); }
  function flash(msg, bad) { var f = $('flash'); f.textContent = msg; f.className = 'flash ' + (bad ? 'bad' : 'good'); f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { f.hidden = true; }, 7000); }
  function me() { return db.session && db.session.employee ? db.session.employee : null; }
  function myEmail() { var e = me(); return e ? e.email : ''; }
  function myPunches() { return WT.forOwner(db.punches, myEmail()); }

  // ===== location + note gate (shared by employee and guest punches) =====
  function getLocation() {
    return new Promise(function (res) {
      if (!navigator.geolocation) return res({ loc: null, status: 'unsupported' });
      navigator.geolocation.getCurrentPosition(function (p) {
        res({ loc: { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }, status: 'ok' });
      }, function (e) { res({ loc: null, status: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }); },
      { enableHighAccuracy: true, timeout: C.GEO_TIMEOUT_MS, maximumAge: 0 });
    });
  }
  function reverseGeocode(loc) {  // silent place name for payroll; the server also reverse-geocodes. Never blocks a punch.
    if (!loc || !window.fetch) return Promise.resolve('');
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = new Promise(function (r) { setTimeout(function () { if (ctl) ctl.abort(); r(''); }, REVERSE_GEOCODE_TIMEOUT_MS); });
    var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + loc.lat + '&longitude=' + loc.lng + '&localityLanguage=en';
    var req = fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.ok ? r.json() : null; })
      .then(WT.placeFromBDC).catch(function () { return ''; });
    return Promise.race([req, timer]);
  }
  function setBusy(b, msg) { document.querySelectorAll('.busy').forEach(function (x) { x.hidden = !b; x.textContent = msg || ''; });
    document.querySelectorAll('.act').forEach(function (x) { x.disabled = b; }); }
  // capture(type, onSaved): GPS -> onsite check -> (note if needed) -> onSaved(record, placePromise)
  function capture(type, onSaved) {
    setBusy(true, 'Checking location…');
    getLocation().then(function (g) {
      setBusy(false);
      var a = WT.assessLocation(g.loc);
      pendingCapture = { type: type, ms: Date.now(), g: g, a: a, place: reverseGeocode(g.loc), onSaved: onSaved };
      if (!a.needsNote) return finishCapture('');
      $('noteWhy').textContent = g.loc ? 'You are not at the office right now. Offsite punches need a short note.'
        : 'Location unavailable. Punches without location need a short note.';
      $('noteTitle').textContent = WT.TYPES[type] + ' — note required';
      $('noteText').value = ''; $('notePanel').hidden = false; $('noteText').focus();
    });
  }
  function finishCapture(note) {
    var p = pendingCapture, ms = p.ms, l = p.g.loc; pendingCapture = null; $('notePanel').hidden = true;
    var rec = { punch_id: WT.newPunchId(window.crypto), syncStatus: 'pending', type: p.type, ts: new Date(ms).toISOString(), local: WT.localTime(ms),
      lat: l ? +l.lat.toFixed(6) : null, lng: l ? +l.lng.toFixed(6) : null, acc: l ? l.acc : null, dist: p.a.dist, onsite: p.a.onsite,
      locStatus: p.g.status, locDesc: '', note: note, status: 'active' };
    rec.onsite_status = WT.onsiteStatus(rec);
    p.onSaved(rec);
    p.place.then(function (place) { if (place) { rec.locDesc = place; save(); } syncAll(); });
  }
  $('noteSave').onclick = function () {
    var n = $('noteText').value.trim();
    if (!WT.noteOk(n)) return flash('Please write at least ' + C.NOTE_MIN_CHARS + ' characters explaining why.', true);
    finishCapture(n);
  };
  $('noteCancel').onclick = function () { pendingCapture = null; $('notePanel').hidden = true; flash('Punch cancelled — nothing saved.', true); };

  function employeePunch(type) {
    if (!WT.canPunch(myPunches(), type)) return flash('That punch is not allowed right now.', true);
    var e = me();
    capture(type, function (rec) {
      rec.ownerEmail = e.email; rec.name = e.full_name; rec.empId = e.employee_id || '';
      db.punches.push(rec); save();
      flash(WT.TYPES[rec.type] + ' saved at ' + shortTime(rec.ts) + ' — ' + WT.locationLabel(rec));
      render();
    });
  }

  // ===== sync queues =====
  function sendEmployee(p) {
    return api(WT.buildPayload(p, S.PUNCH_APP_KEY, db.session.token)).then(function (j) {
      if (j.ok === true) { WT.markSynced(db.punches, p.punch_id, new Date().toISOString()); save(); return true; }
      if (j.authError) { authLost(); return false; }
      if (j.mustChangePassword) { db.session.mustChangePassword = true; save(); render(); return false; }
      return false;
    });
  }
  function sendGuest(g) {
    return api(WT.buildGuestPayload(g, S.PUNCH_APP_KEY)).then(function (j) {
      if (j.ok === true) { g.syncStatus = 'synced'; g.syncedAt = new Date().toISOString(); save(); emit('guestSynced', g); return true; }
      return false;
    });
  }
  function syncAll() {
    if (syncing || !endpointReady() || !window.fetch) return renderSync();
    var jobs = [];
    if (db.session && !db.session.mustChangePassword && !db.session.authNeeded)
      WT.pendingPunches(db.punches, myEmail()).forEach(function (p) { jobs.push(function () { return sendEmployee(p); }); });
    db.guestQueue.filter(function (g) { return g.syncStatus !== 'synced'; }).forEach(function (g) { jobs.push(function () { return sendGuest(g); }); });
    if (!jobs.length) return renderSync();
    syncing = true; renderSync();
    var chain = Promise.resolve(true);
    jobs.forEach(function (job) { chain = chain.then(function (ok) { return ok ? job().catch(function () { return false; }) : false; }); });
    chain.then(done, done);
    function done() {
      syncing = false;
      var week = Date.now() - 7 * 864e5;  // tidy: drop guest punches already delivered more than a week ago
      db.guestQueue = db.guestQueue.filter(function (g) { return g.syncStatus !== 'synced' || Date.parse(g.syncedAt) > week; }); save();
      renderSync();
    }
  }
  function authLost() {
    if (!db.session) return;
    db.lastEmail = myEmail(); db.session.authNeeded = true; save();
    flash('Please sign in again. Your unsent punches are safe on this phone.', true);
    render();
  }
  function renderSync() {
    var el = $('sync'); if (!el) return;
    var n = db.session ? WT.pendingPunches(db.punches, myEmail()).length : 0;
    el.textContent = syncing && n ? 'Saving punches…' : WT.syncLabel(n, endpointReady(), db.session && db.session.authNeeded);
    el.className = 'sync ' + (n ? 'wait' : 'done');
  }
  function emit(name, x) { listeners.forEach(function (l) { if (l[0] === name) l[1](x); }); }

  // ===== clock views (location shown ONLY as Onsite / Offsite / Location unavailable) =====
  var STATUS = { off: 'Off the clock', on: 'On the clock', lunch: 'At lunch (unpaid)', 'break': 'On break (paid)' };
  function punchRow(p) {
    var lab = WT.locationLabel(p), cls = lab === 'Onsite' ? 'on' : lab === 'Offsite' ? 'off' : 'na';
    return '<li><b>' + shortTime(p.ts) + '</b> ' + esc(WT.TYPES[p.type]) + ' <span class="tag ' + cls + '">' + lab + '</span>' +
      (p.status === 'edited' ? ' <span class="tag na">corrected</span>' : '') + (p.note ? '<div class="note">“' + esc(p.note) + '”</div>' : '') + '</li>';
  }
  function weekBlock(ps, wk, open) {
    var s = WT.weekSummary(ps, wk, Date.now(), C.TIMEZONE);
    var days = s.days.filter(function (d) { return d.punches.length || d.netHours; }).map(function (d) {
      return '<div class="day"><div class="dh"><span>' + dayLabel(d.date) + '</span><b>' + d.netHours.toFixed(2) + ' h</b></div><small>lunch ' + d.lunchMinutes +
        'm · break ' + d.breakMinutes + 'm</small><ul class="pl">' + d.punches.map(punchRow).join('') + '</ul></div>';
    }).join('') || '<p class="muted">No punches this week.</p>';
    return '<details class="wk"' + (open ? ' open' : '') + '><summary><span>Week of ' + dayLabel(s.weekStart) + ' – ' + dayLabel(s.weekEnd) + '</span><b>' +
      s.totals.netHours.toFixed(2) + ' h</b></summary><p class="muted">Lunch ' + s.totals.lunchMinutes + 'm (unpaid) · Breaks ' + s.totals.breakMinutes +
      'm (paid)' + (s.totals.shiftOpen ? ' · <b>shift open</b>' : '') + '</p>' + days + '</details>';
  }
  function currentScreen() {
    if (db.session && !db.session.authNeeded) return db.session.mustChangePassword ? 'force' : 'app';
    return screen === 'guest' || screen === 'guestDone' ? screen : 'login';
  }
  function render() {
    var sc = currentScreen();
    ['login', 'force', 'guest', 'guestDone', 'app'].forEach(function (id) { $(id).hidden = id !== sc; });
    emit('render', sc);
    renderSync();
    if (sc !== 'app') return;
    var e = me(), ps = myPunches();
    $('meName').textContent = e.full_name + (e.employee_id ? ' · ID ' + e.employee_id : '');
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.className = b.dataset.tab === view ? 'navy' : 'ghost'; });
    ['clock', 'week', 'history'].forEach(function (v) { $(v).hidden = v !== view; });
    var st = WT.stateOf(ps), nxt = WT.allowed(ps);
    $('status').textContent = STATUS[st]; $('status').className = 'status s-' + st;
    $('actions').innerHTML = nxt.map(function (t, i) { return '<button class="act ' + (i === 0 ? 'go big' : 'navy') + '" data-act="' + t + '">' + WT.TYPES[t] + '</button>'; }).join('');
    var now = Date.now(), today = WT.dateKey(now), wk = WT.weekStart(now), s = WT.weekSummary(ps, wk, now, C.TIMEZONE);
    var tp = WT.sortPunches(ps).filter(function (p) { return WT.dateKey(Date.parse(p.ts)) === today; });
    $('today').innerHTML = tp.map(punchRow).join('') || '<li class="muted">No punches today.</li>';
    var td = s.days.filter(function (d) { return d.date === today; })[0];
    $('todayHrs').textContent = td ? td.netHours.toFixed(2) + ' h today' : '';
    $('wkHrs').textContent = s.totals.netHours.toFixed(2) + ' h';
    $('wkSub').textContent = 'Week ' + dayLabel(s.weekStart) + ' – ' + dayLabel(s.weekEnd) + ' · lunch ' + hm(s.totals.lunchMinutes) + ' · breaks ' + hm(s.totals.breakMinutes);
    if (view === 'week') $('weekBody').innerHTML = weekBlock(ps, wk, true);
    if (view === 'history') {
      var first = ps.length ? WT.weekStart(Date.parse(WT.sortPunches(ps)[0].ts)) : wk, out = [], w = wk;
      for (var i = 0; i < 9 || w >= first; i++) { out.push(weekBlock(ps, w, false)); w = WT.addDays(w, -7); if (i > 200) break; }
      $('histBody').innerHTML = out.join('');
    }
  }
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-tab]'); if (t) { view = t.dataset.tab; render(); }
    var a = ev.target.closest('[data-act]'); if (a && currentScreen() === 'app') employeePunch(a.dataset.act);
  });

  window.WTApp = {
    db: function () { return db; }, save: save, api: api, render: render, flash: flash, capture: capture, syncAll: syncAll,
    endpointReady: endpointReady, me: me, shortTime: shortTime, setScreen: function (s) { screen = s; render(); },
    on: function (name, fn) { listeners.push([name, fn]); }, settings: S,
    start: function () {
      render(); syncAll();
      window.addEventListener('online', syncAll);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { emit('visible'); syncAll(); render(); } });
      setInterval(syncAll, RETRY_EVERY_MS);
      setInterval(function () { if (currentScreen() === 'app' && view === 'clock' && $('notePanel').hidden && !document.querySelector('.busy:not([hidden])')) render(); }, 30000);
      if ('serviceWorker' in navigator) navigator.serviceWorker.register('staff-sw.js').catch(function () {});
    }
  };
})();
