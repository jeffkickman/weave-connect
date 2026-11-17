/* Weave Time — staff UI. Data lives ONLY in this phone's localStorage (key weavetime.v3). */
(function () {
  'use strict';
  var C = WT.CONFIG, KEY = 'weavetime.v3', $ = function (id) { return document.getElementById(id); };
  var db = load(), pending = null, view = 'clock';

  function load() {
    var d; try { d = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { d = null; }
    if (!d) { d = { profile: null, punches: [] }; importLegacy(d); }
    return d;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }
  // Earlier staff.html (weave.time.v2) stored clock_in/clock_out without location. Bring those over once, clearly labeled.
  function importLegacy(d) {
    try {
      var old = JSON.parse(localStorage.getItem('weave.time.v2') || 'null'), id = localStorage.getItem('weave.current');
      var u = old && old.users && old.users[id];
      if (!u) return;
      d.profile = { name: u.name, empId: '' };
      (u.punches || []).forEach(function (p) {
        if (p.kind !== 'clock_in' && p.kind !== 'clock_out') return;
        var ms = Date.parse(p.at);
        d.punches.push({ id: p.id, type: p.kind, ts: new Date(ms).toISOString(), local: WT.localTime(ms), lat: null, lng: null, acc: null,
          dist: null, onsite: false, locStatus: 'legacy-import', note: 'Imported from earlier Weave Time page (no location recorded)', name: u.name, empId: '' });
      });
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch (e) { /* ignore */ }
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hm(min) { min = Math.round(min); return Math.floor(min / 60) + 'h ' + (min % 60 < 10 ? '0' : '') + (min % 60) + 'm'; }
  function shortTime(ts) { return new Date(ts).toLocaleTimeString('en-US', { timeZone: C.TIMEZONE, hour: 'numeric', minute: '2-digit' }); }
  function dayLabel(k) { var a = k.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2], 12)).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }); }
  function flash(msg, bad) { var f = $('flash'); f.textContent = msg; f.className = 'flash ' + (bad ? 'bad' : 'good'); f.hidden = false; clearTimeout(flash.t); flash.t = setTimeout(function () { f.hidden = true; }, 6000); }

  // ===== identity =====
  $('saveProfile').onclick = function () {
    var name = $('pName').value.trim();
    if (name.length < 2) return flash('Enter your full name.', true);
    db.profile = { name: name, empId: $('pId').value.trim() }; save(); render();
  };
  $('editProfile').onclick = function () { $('pName').value = db.profile.name; $('pId').value = db.profile.empId || ''; db.profile = null; render(); };

  // ===== punching =====
  function getLocation() {
    return new Promise(function (res) {
      if (!navigator.geolocation) return res({ loc: null, status: 'unsupported' });
      navigator.geolocation.getCurrentPosition(function (p) {
        res({ loc: { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }, status: 'ok' });
      }, function (e) { res({ loc: null, status: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }); },
      { enableHighAccuracy: true, timeout: C.GEO_TIMEOUT_MS, maximumAge: 0 });
    });
  }
  function startPunch(type) {
    if (!WT.canPunch(db.punches, type)) return flash('That punch is not allowed right now.', true);
    setBusy(true, 'Getting your location…');
    getLocation().then(function (g) {
      setBusy(false);
      var a = WT.assessLocation(g.loc);
      pending = { type: type, ms: Date.now(), g: g, a: a };
      if (!a.needsNote) return commit('');
      $('noteWhy').textContent = g.loc
        ? 'You are about ' + fmtDist(a.dist) + ' from the office (±' + g.loc.acc + ' m). Offsite punches need a short note.'
        : 'Location ' + g.status + '. Punches without location need a short note.';
      $('noteTitle').textContent = WT.TYPES[type] + ' — note required';
      $('noteText').value = ''; $('notePanel').hidden = false; $('noteText').focus();
    });
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1609.34).toFixed(1) + ' mi' : m + ' m'; }
  function commit(note) {
    var p = pending, ms = p.ms, l = p.g.loc;
    db.punches.push({ id: ms.toString(36) + Math.random().toString(36).slice(2, 6), type: p.type, ts: new Date(ms).toISOString(), local: WT.localTime(ms),
      lat: l ? +l.lat.toFixed(6) : null, lng: l ? +l.lng.toFixed(6) : null, acc: l ? l.acc : null, dist: p.a.dist, onsite: p.a.onsite,
      locStatus: p.g.status, note: note, name: db.profile.name, empId: db.profile.empId || '' });
    save(); pending = null; $('notePanel').hidden = true;
    flash(WT.TYPES[p.type] + ' saved at ' + shortTime(ms) + ' — ' + (p.a.onsite ? 'onsite ✓' : 'offsite (note saved)'));
    render();
  }
  $('noteSave').onclick = function () {
    var n = $('noteText').value.trim();
    if (!WT.noteOk(n)) return flash('Please write at least ' + C.NOTE_MIN_CHARS + ' characters explaining why.', true);
    commit(n);
  };
  $('noteCancel').onclick = function () { pending = null; $('notePanel').hidden = true; flash('Punch cancelled — nothing saved.', true); };
  function setBusy(b, msg) { $('busy').hidden = !b; $('busy').textContent = msg || ''; document.querySelectorAll('.act').forEach(function (x) { x.disabled = b; }); }

  // ===== export =====
  function summary(wk) { return WT.weekSummary(db.punches, wk, Date.now(), C.TIMEZONE, db.profile); }
  function fileBase(s) { return 'weave-time_' + (s.employee.name || 'employee').replace(/[^A-Za-z0-9]+/g, '-') + '_' + s.weekStart; }
  function download(name, text, mime) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function doExport(kind, wk) {
    var s = summary(wk);
    if (kind === 'csv') return download(fileBase(s) + '.csv', WT.toCSV(s), 'text/csv');
    if (kind === 'json') return download(fileBase(s) + '.json', JSON.stringify(s, null, 2), 'application/json');
    var text = WT.toText(s);
    if (navigator.share) return navigator.share({ title: 'Weave Time ' + s.weekStart, text: text }).catch(function () {});
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { flash('Summary copied — paste it to payroll.'); },
      function () { window.prompt('Copy this summary:', text); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-exp]'); if (b) doExport(b.dataset.exp, b.dataset.wk);
    var t = e.target.closest('[data-tab]'); if (t) { view = t.dataset.tab; render(); }
    var a = e.target.closest('[data-act]'); if (a) startPunch(a.dataset.act);
  });

  // ===== render =====
  var STATUS = { off: 'Off the clock', on: 'On the clock', lunch: 'At lunch (unpaid)', 'break': 'On break (paid)' };
  function punchRow(p) {
    return '<li><b>' + shortTime(p.ts) + '</b> ' + esc(WT.TYPES[p.type]) + ' <span class="tag ' + (p.onsite ? 'on' : 'off') + '">' +
      (p.onsite ? 'onsite' : p.locStatus === 'legacy-import' ? 'imported' : 'offsite') + '</span>' +
      (p.dist != null ? ' <small>' + fmtDist(p.dist) + (p.acc != null ? ' ±' + p.acc + 'm' : '') + '</small>' : ' <small>no location</small>') +
      (p.note ? '<div class="note">“' + esc(p.note) + '”</div>' : '') + '</li>';
  }
  function expButtons(wk) {
    return '<div class="row"><button class="ghost sm" data-exp="csv" data-wk="' + wk + '">CSV</button><button class="ghost sm" data-exp="json" data-wk="' + wk +
      '">JSON</button><button class="ghost sm" data-exp="share" data-wk="' + wk + '">Share / Copy</button></div>';
  }
  function weekBlock(wk, open) {
    var s = summary(wk);
    var days = s.days.filter(function (d) { return d.punchCount || d.netHours; }).map(function (d) {
      var dp = s.punches.filter(function (p) { return WT.dateKey(Date.parse(p.ts)) === d.date; });
      return '<div class="day"><div class="dh"><span>' + dayLabel(d.date) + '</span><b>' + d.netHours.toFixed(2) + ' h</b></div><small>lunch ' + d.lunchMinutes +
        'm · break ' + d.breakMinutes + 'm</small><ul class="pl">' + dp.map(function (p) { p = { type: p.type, ts: p.ts, onsite: p.onsite, dist: p.distanceM, acc: p.accuracyM, note: p.note, locStatus: p.locationStatus }; return punchRow(p); }).join('') + '</ul></div>';
    }).join('') || '<p class="muted">No punches this week.</p>';
    return '<details class="wk"' + (open ? ' open' : '') + '><summary><span>Week of ' + dayLabel(s.weekStart) + ' – ' + dayLabel(s.weekEnd) + '</span><b>' +
      s.totals.netHours.toFixed(2) + ' h</b></summary><p class="muted">Lunch ' + s.totals.lunchMinutes + 'm (unpaid) · Breaks ' + s.totals.breakMinutes +
      'm (paid) · Offsite punches ' + s.totals.offsitePunches + (s.totals.shiftOpen ? ' · <b>shift open</b>' : '') + '</p>' + days + expButtons(wk) + '</details>';
  }
  function render() {
    var hasP = !!db.profile;
    $('who').hidden = hasP; $('app').hidden = !hasP;
    if (!hasP) return;
    $('meName').textContent = db.profile.name + (db.profile.empId ? ' · ID ' + db.profile.empId : '');
    document.querySelectorAll('[data-tab]').forEach(function (b) { b.className = b.dataset.tab === view ? 'navy' : 'ghost'; });
    ['clock', 'week', 'history'].forEach(function (v) { $(v).hidden = v !== view; });
    var st = WT.stateOf(db.punches), nxt = WT.allowed(db.punches);
    $('status').textContent = STATUS[st]; $('status').className = 'status s-' + st;
    $('actions').innerHTML = nxt.map(function (t, i) { return '<button class="act ' + (i === 0 ? 'go big' : 'navy') + '" data-act="' + t + '">' + WT.TYPES[t] + '</button>'; }).join('');
    var now = Date.now(), today = WT.dateKey(now), wk = WT.weekStart(now), s = summary(wk);
    var tp = WT.sortPunches(db.punches).filter(function (p) { return WT.dateKey(Date.parse(p.ts)) === today; });
    $('today').innerHTML = tp.map(punchRow).join('') || '<li class="muted">No punches today.</li>';
    var td = s.days.filter(function (d) { return d.date === today; })[0];
    $('todayHrs').textContent = td ? td.netHours.toFixed(2) + ' h today' : '';
    $('wkHrs').textContent = s.totals.netHours.toFixed(2) + ' h';
    $('wkSub').textContent = 'Week ' + dayLabel(s.weekStart) + ' – ' + dayLabel(s.weekEnd) + ' · lunch ' + hm(s.totals.lunchMinutes) + ' · breaks ' + hm(s.totals.breakMinutes);
    if (view === 'week') $('weekBody').innerHTML = weekBlock(wk, true);
    if (view === 'history') {
      var first = db.punches.length ? WT.weekStart(Date.parse(WT.sortPunches(db.punches)[0].ts)) : wk, out = [], w = wk;
      for (var i = 0; i < 9 || w >= first; i++) { out.push(weekBlock(w, false)); w = WT.addDays(w, -7); if (i > 200) break; }
      $('histBody').innerHTML = out.join('');
    }
  }
  render();
  setInterval(function () { if (view === 'clock' && $('notePanel').hidden && $('busy').hidden) render(); }, 30000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('staff-sw.js').catch(function () {});
})();
