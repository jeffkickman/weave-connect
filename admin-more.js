/* Weave Time — admin view part 2: Timeline (location history per clock-in session), Punches (edit / void / add missed), Employees. */
(function () {
  'use strict';
  var A = window.WTApp, X = window.WTA, W = window.WTAdmin; if (!W) return;
  var st = W.st, views = W.views, esc = A.esc, $ = function (id) { return document.getElementById(id); };
  var TYPES = WT.TYPES, tl = st.tl = { email: '', sessions: null, sid: '', points: null, from: '', to: '' }, pu = st.pu = { email: '', week: '', voids: false, list: null, editing: '' };
  function ok(msg) { A.flash(msg); }
  function users() {
    if (st.users) return Promise.resolve(st.users);
    return W.call('admin_list_users').then(function (j) { st.users = j.users; return j.users; });
  }
  function staff() { return (st.users || []).filter(function (u) { return u.role !== 'admin'; }); }
  function empOptions(sel, extra) {
    return (extra || '') + staff().map(function (u) { return '<option value="' + esc(u.email) + '"' + (u.email === sel ? ' selected' : '') + '>' + esc(u.full_name) + (u.active ? '' : ' (inactive)') + '</option>'; }).join('');
  }
  function typeOptions(sel) { return Object.keys(TYPES).map(function (t) { return '<option value="' + t + '"' + (t === sel ? ' selected' : '') + '>' + esc(TYPES[t]) + '</option>'; }).join(''); }
  function need(fn) { if (!st.users) { users().then(W.draw, W.fail); return '<p class="muted">Loading…</p>'; } return fn(); }

  // ===== Timeline =====
  function loadSessions() {
    tl.sessions = null; tl.points = null; tl.sid = ''; W.draw();
    if (!tl.email) return;
    W.call('admin_sessions', { email: tl.email }).then(function (j) { tl.sessions = j.sessions; W.draw(); }, W.fail);
  }
  function loadPoints(body) {
    tl.points = null; W.draw();
    W.call('admin_timeline', body).then(function (j) { tl.points = j.points; W.draw(); }, W.fail);
  }
  W.openTimeline = function (email, sid) {
    tl.email = email; st.tab = 'timeline';
    users().then(function () {
      W.call('admin_sessions', { email: email }).then(function (j) { tl.sessions = j.sessions; if (sid) { tl.sid = sid; loadPoints({ email: email, session_id: sid }); } else W.draw(); }, W.fail);
    }, W.fail);
    W.draw();
  };
  views.timeline = function () {
    return need(function () {
      var h = '<div class="ad-card ad-f"><label for="tlEmp">Employee</label><select id="tlEmp">' + empOptions(tl.email, '<option value="">Choose…</option>') + '</select>';
      if (tl.email) h += '<div class="ad-row" style="margin-top:.5rem"><span>or dates</span><input id="tlFrom" type="date" value="' + esc(tl.from) + '" style="width:auto"><input id="tlTo" type="date" value="' + esc(tl.to) + '" style="width:auto"><button class="ghost btn-s" id="tlRange" type="button">Show</button></div>';
      h += '<p class="muted">Points are recorded only while the employee is clocked in (every ~3 minutes or after moving 150 m, while their app is open, plus every punch).</p></div>';
      if (tl.email && !tl.sessions) h += '<p class="muted">Loading sessions…</p>';
      if (tl.sessions) h += '<div class="ad-card"><b>Clock-in sessions (last 10 weeks)</b>' + (tl.sessions.map(function (s) {
        return '<div class="ad-row" style="margin-top:.35rem"><button type="button" class="' + (s.session_id === tl.sid ? 'navy' : 'ghost') + ' btn-s ad-grow" data-sess="' + esc(s.session_id) + '" style="text-align:left">' +
          esc(X.ctLabel(s.start_utc)) + ' → ' + (s.open ? 'open' : esc(X.ctTime(s.end_utc))) + ' · ' + s.net_hours.toFixed(2) + ' h · ' + s.point_count + ' pts</button></div>';
      }).join('') || '<p class="muted">No sessions yet.</p>') + '</div>';
      if ((tl.sid || tl.from) && !tl.points) h += '<p class="muted">Loading points…</p>';
      if (tl.points) h += timelineBody(tl.points);
      return h;
    });
  };
  function timelineBody(pts) {
    if (!pts.length) return '<div class="ad-card muted">No location points for this selection.</div>';
    var stays = X.groupStays(pts), route = X.routeLink(pts);
    return '<div class="ad-map" id="tlMap"></div><div class="ad-row">' + (route ? W.mapsBtn(route, 'Route in Google Maps') : '') + '<span class="muted">' + pts.length + ' points · ' + stays.length + ' stops</span></div>' +
      '<div class="ad-card"><b>Stops</b>' + stays.map(function (s) {
        return '<div class="ad-row" style="margin-top:.4rem;border-top:1px solid #eee;padding-top:.4rem"><span class="ad-grow"><b>' + esc(X.ctTime(s.start_utc)) + '–' + esc(X.ctTime(s.end_utc)) + '</b> · ' + esc(X.minutesLabel(s.minutes)) +
          '<br>' + esc(s.location_description || (s.lat.toFixed(5) + ', ' + s.lng.toFixed(5))) + ' <span class="muted">(' + s.count + ' pts)</span></span>' + W.onsitePill(s.onsite_status) + W.mapsBtn(s.maps_link, 'Map') + '</div>';
      }).join('') + '</div>' +
      '<details class="ad-card"><summary>All points</summary><div class="ad-scroll"><table class="ad-tbl"><tr><th>Time</th><th>State</th><th>Place</th><th class="n">From office</th><th></th></tr>' + pts.map(function (p) {
        return '<tr><td>' + esc(X.ctTime(p.timestamp_utc)) + '<br><span class="muted">' + esc(p.source) + '</span></td><td>' + esc(p.state) + '</td><td>' + esc(p.location_description) + (p.accuracy_m ? ' <span class="muted">±' + esc(p.accuracy_m) + ' m</span>' : '') +
          '</td><td class="n">' + esc(p.distance_m) + ' m</td><td>' + W.mapsBtn(p.maps_link, 'Map') + '</td></tr>';
      }).join('') + '</table></div></details>';
  }
  views.timelineAfter = function () {
    if (!tl.points || !tl.points.length) return;
    var mk = tl.points.filter(function (p) { return p.latitude !== ''; }).map(function (p) { return { lat: +p.latitude, lng: +p.longitude, label: X.ctTime(p.timestamp_utc) + ' ' + (p.location_description || ''), color: p.source === 'punch' ? '#C4A35A' : '#0B1F3A' }; });
    W.drawMap($('tlMap'), mk, true);
  };

  // ===== Punches =====
  function loadPunches() {
    pu.list = null; pu.loading = true; W.draw();
    var b = { include_void: pu.voids }; if (pu.email) b.email = pu.email; if (pu.week) b.week_start = pu.week;
    W.call('admin_punches', b).then(function (j) { pu.loading = false; pu.list = j.punches; W.draw(); }, function (e) { pu.loading = false; W.fail(e); });
  }
  views.punches = function () {
    return need(function () {
      if (!pu.week) pu.week = st.live ? st.live.week_start_sun : (st.week ? st.week.week_start_sun : WT.weekStart(Date.now()));
      if (!pu.list && !pu.loading) setTimeout(function () { if (!pu.list && !pu.loading) loadPunches(); }, 0);
      var h = '<div class="ad-card ad-f"><div class="ad-row"><select id="puEmp" class="ad-grow">' + empOptions(pu.email, '<option value="">Everyone</option><option value="guest"' + (pu.email === 'guest' ? ' selected' : '') + '>Guests</option>') + '</select>' +
        '<button class="ghost btn-s" data-puwk="-7" type="button">‹</button><span>Week of ' + esc(A.dayLabel(pu.week)) + '</span><button class="ghost btn-s" data-puwk="7" type="button">›</button>' +
        '<label style="margin:0"><input type="checkbox" id="puVoid" style="width:auto"' + (pu.voids ? ' checked' : '') + '> voided</label></div></div>' +
        '<details class="ad-card ad-f" id="addBox"><summary><b>Add a missed punch</b></summary><form id="addForm"><label for="adEmp">Employee</label><select id="adEmp" required>' + empOptions(pu.email !== 'guest' ? pu.email : '', '<option value="">Choose…</option>') + '</select>' +
        '<label for="adType">Punch</label><select id="adType">' + typeOptions('clock_in') + '</select><label for="adWhen">Date &amp; time (Central)</label><input id="adWhen" type="datetime-local" required>' +
        '<label for="adNote">Note (optional)</label><input id="adNote" maxlength="300"><label for="adReason">Reason (required, saved in the audit trail)</label><input id="adReason" required minlength="3" maxlength="300">' +
        '<div class="row"><button class="go" type="submit">Add punch</button></div></form></details>';
      if (!pu.list) return h + '<p class="muted">Loading punches…</p>';
      return h + (pu.list.map(row).join('') || '<p class="muted">No punches for this filter.</p>');
    });
  };
  function row(p) {
    if (pu.editing === p.punch_id) return '<form class="ad-card ad-f" data-editform="' + esc(p.punch_id) + '"><b>' + esc(p.employee_name) + '</b><label>Punch</label><select name="type">' + typeOptions(p.punch_type) + '</select>' +
      '<label>Date &amp; time (Central)</label><input name="when" type="datetime-local" data-orig="' + esc(X.utcToCtInput(p.timestamp_utc)) + '" value="' + esc(X.utcToCtInput(p.timestamp_utc)) + '" required><label>Note</label><input name="note" value="' + esc(p.note) + '" maxlength="300">' +
      '<label>Reason for the change (required)</label><input name="reason" required minlength="3" maxlength="300"><div class="row"><button class="ghost" type="button" data-editcancel="1">Cancel</button><button class="go" type="submit">Save</button></div></form>';
    var guest = p.record_type === 'GUEST';
    return '<div class="ad-card"><div class="ad-row"><span class="ad-grow"><b>' + esc(X.ctLabel(p.timestamp_utc)) + '</b> · ' + esc(TYPES[p.punch_type] || p.punch_type) + '<br>' + esc(p.employee_name) + (guest ? ' <span class="pill p-bad">GUEST</span>' : '') + (p.is_test === 'TRUE' ? ' <span class="pill p-bad">TEST</span>' : '') +
      (p.status === 'void' ? ' <span class="pill p-bad">void</span>' : p.status === 'edited' ? ' <span class="pill">edited by ' + esc(p.edited_by) + '</span>' : '') + (p.source === 'admin' ? ' <span class="pill">added</span>' : '') + '</span>' + W.onsitePill(p.onsite_status) + W.mapsBtn(p.maps_link, 'Map') + '</div>' +
      (p.location_description ? '<div class="muted">' + esc(p.location_description) + '</div>' : '') + (p.note ? '<div class="note">“' + esc(p.note) + '”</div>' : '') + (guest && p.guest_note ? '<div class="note">Guest: ' + esc(p.guest_note) + '</div>' : '') +
      (p.edit_reason ? '<div class="muted">Reason: ' + esc(p.edit_reason) + '</div>' : '') +
      '<div class="ad-row" style="margin-top:.4rem">' + (p.status === 'void' ? '<button class="ghost btn-s" type="button" data-restore="' + esc(p.punch_id) + '">Restore</button>'
        : '<button class="ghost btn-s" type="button" data-edit="' + esc(p.punch_id) + '">Edit</button><button class="ghost btn-s" type="button" data-void="' + esc(p.punch_id) + '">Void</button>') + '</div></div>';
  }
  function editPunch(id, updates, reason) {
    return W.call('admin_edit_punch', { punch_id: id, updates: updates, edit_reason: reason }).then(function () { pu.editing = ''; st.week = null; st.live = null; ok('Punch updated.'); loadPunches(); }, W.fail);
  }

  // ===== Employees =====
  views.employees = function () {
    return need(function () {
      var me = (A.me() || {}).email;
      return '<details class="ad-card ad-f"><summary><b>Add an employee</b></summary><form id="nuForm"><label for="nuName">Full name</label><input id="nuName" required maxlength="120">' +
        '<label for="nuEmail">Email (their sign-in)</label><input id="nuEmail" type="email" required autocomplete="off"><label for="nuId">Employee ID (optional)</label><input id="nuId" maxlength="60">' +
        '<label for="nuPass">Temporary password (they must change it at first sign-in)</label><input id="nuPass" type="password" value="WeaveMeIn" minlength="6" required autocomplete="new-password">' +
        '<label for="nuRole">Role</label><select id="nuRole"><option value="employee">Employee (clocks in/out)</option><option value="driver">Driver (clock + route forms)</option><option value="admin">Admin (sees everything, no clock)</option></select>' +
        '<div class="row"><button class="go" type="submit">Create account</button></div></form></details>' +
        st.users.map(function (u) {
          var self = u.email === me;
          return '<div class="ad-card"><div class="ad-row"><span class="ad-grow"><b>' + esc(u.full_name) + '</b>' + (u.employee_id ? ' <span class="muted">· ' + esc(u.employee_id) + '</span>' : '') + '<br><span class="muted">' + esc(u.email) + '</span></span>' +
            '<span class="pill ' + (u.role === 'admin' ? 'p-lunch' : u.role === 'driver' ? 'p-on' : '') + '">' + esc(u.role) + '</span>' + (u.active ? '' : '<span class="pill p-bad">inactive</span>') + (u.must_change_password ? '<span class="pill">temp password</span>' : '') + '</div>' +
            '<div class="muted">Last sign-in: ' + (u.last_login_utc ? esc(X.ctLabel(u.last_login_utc)) : 'never') + '</div>' +
            '<div class="ad-row" style="margin-top:.4rem"><button class="ghost btn-s" type="button" data-reset="' + esc(u.email) + '">Reset password</button>' +
            (self ? '<span class="muted">(you)</span>' : '<button class="ghost btn-s" type="button" data-active="' + esc(u.email) + '" data-to="' + (u.active ? 'false' : 'true') + '">' + (u.active ? 'Deactivate' : 'Reactivate') + '</button>' +
              ['employee', 'driver', 'admin'].filter(function (r) { return r !== u.role; }).map(function (r) { return '<button class="ghost btn-s" type="button" data-role="' + esc(u.email) + '" data-to="' + r + '">Make ' + r + '</button>'; }).join('') +
              '<button class="ghost btn-s" type="button" data-remove="' + esc(u.email) + '" style="color:#a32020">Remove</button>') + '</div>' +
            (st.resetFor === u.email ? '<form class="ad-f" data-resetform="' + esc(u.email) + '"><label>New temporary password</label><input name="pw" type="password" value="WeaveMeIn" minlength="6" required autocomplete="new-password">' +
              '<div class="row"><button class="ghost" type="button" data-resetcancel="1">Cancel</button><button class="go" type="submit">Reset — signs them out</button></div></form>' : '') + '</div>';
        }).join('');
    });
  };
  function reloadUsers(msg) { st.users = null; st.resetFor = ''; if (msg) ok(msg); users().then(W.draw, W.fail); }

  // ===== events =====
  document.addEventListener('change', function (ev) {
    if (A.currentScreen() !== 'admin') return; var id = ev.target.id;
    if (id === 'tlEmp') { tl.email = ev.target.value; tl.from = tl.to = ''; loadSessions(); }
    if (id === 'puEmp') { pu.email = ev.target.value; loadPunches(); }
    if (id === 'puVoid') { pu.voids = ev.target.checked; loadPunches(); }
  });
  document.addEventListener('click', function (ev) {
    if (A.currentScreen() !== 'admin') return; var t = ev.target, d = t.dataset || {};
    if (d.sess) { tl.sid = d.sess; tl.from = tl.to = ''; return loadPoints({ email: tl.email, session_id: tl.sid }); }
    if (t.id === 'tlRange') { tl.from = $('tlFrom').value; tl.to = $('tlTo').value || tl.from; if (!tl.from) return A.flash('Pick a start date.', true); tl.sid = ''; return loadPoints({ email: tl.email, from: tl.from, to: tl.to }); }
    if (d.puwk) { pu.week = X.addDays(pu.week, +d.puwk); return loadPunches(); }
    if (d.edit) { pu.editing = d.edit; return W.draw(); }
    if (d.editcancel) { pu.editing = ''; return W.draw(); }
    if (d['void']) { var r = window.prompt('Reason for voiding this punch (kept in the audit trail):'); if (r && r.trim().length >= 3) editPunch(d['void'], { status: 'void' }, r.trim()); else if (r !== null) A.flash('A reason (3+ characters) is required.', true); return; }
    if (d.restore) { var r2 = window.prompt('Reason for restoring this punch:'); if (r2 && r2.trim().length >= 3) editPunch(d.restore, { status: 'edited' }, r2.trim()); return; }
    if (d.reset) { st.resetFor = d.reset; return W.draw(); }
    if (d.resetcancel) { st.resetFor = ''; return W.draw(); }
    if (d.active) return W.call('admin_set_active', { email: d.active, active: d.to === 'true' }).then(function () { reloadUsers(d.to === 'true' ? 'Reactivated.' : 'Deactivated — they can no longer sign in.'); }, W.fail);
    if (d.role) { if (!window.confirm('Change ' + d.role + ' to ' + d.to + '?')) return; return W.call('admin_set_role', { email: d.role, role: d.to }).then(function () { reloadUsers('Role updated.'); }, W.fail); }
    if (d.remove) { if (!window.confirm('Remove ' + d.remove + '? Their punches stay in the sheet; they can no longer sign in.')) return; return W.call('admin_delete_user', { email: d.remove }).then(function () { reloadUsers('Removed.'); }, W.fail); }
  });
  document.addEventListener('submit', function (ev) {
    if (A.currentScreen() !== 'admin') return; var f = ev.target; ev.preventDefault();
    if (f.id === 'addForm') {
      var when = X.ctInputToUtc($('adWhen').value); if (!$('adEmp').value || !when) return A.flash('Choose the employee and the date/time.', true);
      return W.call('admin_add_punch', { email: $('adEmp').value, punch_type: $('adType').value, timestamp_utc: when, note: $('adNote').value.trim(), edit_reason: $('adReason').value.trim() })
        .then(function () { st.week = null; st.live = null; ok('Missed punch added.'); loadPunches(); }, W.fail);
    }
    if (f.dataset.editform) {
      var w = X.ctInputToUtc(f.elements.when.value), up = { punch_type: f.elements.type.value, note: f.elements.note.value.trim() };
      if (!w) return A.flash('Enter a valid date and time.', true);
      if (f.elements.when.value !== f.elements.when.dataset.orig) up.timestamp_utc = w;   // unchanged time keeps its exact seconds
      return editPunch(f.dataset.editform, up, f.elements.reason.value.trim());
    }
    if (f.id === 'nuForm') {
      return W.call('admin_create_user', { full_name: $('nuName').value.trim(), email: $('nuEmail').value.trim().toLowerCase(), employee_id: $('nuId').value.trim(), initial_password: $('nuPass').value, role: $('nuRole').value })
        .then(function (j) { reloadUsers('Account created for ' + j.email + '. They sign in with the temporary password and must change it.'); }, W.fail);
    }
    if (f.dataset.resetform) return W.call('admin_reset_password', { email: f.dataset.resetform, initial_password: f.elements.pw.value }).then(function () { reloadUsers('Password reset. They must change it at next sign-in.'); }, W.fail);
  });
  A.on('render', function (sc) { if (sc === 'login') { st.users = null; tl.email = tl.sid = ''; tl.sessions = tl.points = null; pu.list = null; pu.email = pu.week = pu.editing = ''; } });
})();
