/* Weave Time — invite-only sign in, password changes, session refresh, and "Punch as guest".
   Accounts are created by Jeff (weave-admin.py); there is no self-registration. */
(function () {
  'use strict';
  var A = window.WTApp, S = A.settings, $ = function (id) { return document.getElementById(id); };
  var lastGuest = null;
  function err(id, msg) { var el = $(id); el.textContent = msg || ''; el.hidden = !msg; }
  function busyBtn(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }
  function netMsg(e) { return A.endpointReady() ? 'Could not reach the Weave Time server. Check your connection and try again.' : (e && e.message) || 'Server not connected yet.'; }

  function setSession(j, keepAuth) {
    var db = A.db();
    db.session = { token: j.sessionToken, expiresAt: j.expiresAt, mustChangePassword: !!j.mustChangePassword, employee: j.employee, authNeeded: false };
    db.lastEmail = j.employee.email;
    if (j.employee && j.employee.role !== 'admin') db.testMode = { email: j.employee.email, on: false };
    A.save();
  }
  // Punches recorded by the older phone-only version (weavetime.v3) are adopted ONLY if that phone's saved name matches this account.
  function adoptLegacy() {
    var db = A.db(), e = A.me(); if (!e) return 0;
    var old; try { old = JSON.parse(localStorage.getItem('weavetime.v3') || 'null'); } catch (x) { old = null; }
    if (!old || !old.profile || !(old.punches || []).length) return 0;
    var norm = function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); };
    if (norm(old.profile.name) !== norm(e.full_name)) return 0;
    var have = {}; db.punches.forEach(function (p) { have[p.punch_id] = 1; });
    var n = 0;
    old.punches.forEach(function (p) {
      var id = p.punch_id || WT.newPunchId(window.crypto); if (have[id]) return;
      var r = {}; for (var k in p) r[k] = p[k];
      r.punch_id = id; r.syncStatus = 'pending'; r.ownerEmail = e.email; r.name = e.full_name; r.empId = e.employee_id || ''; r.status = 'active';
      db.punches.push(r); n++;
    });
    localStorage.setItem('weavetime.v3.adopted', localStorage.getItem('weavetime.v3')); localStorage.removeItem('weavetime.v3');
    A.save(); return n;
  }
  // Pull this employee's punches from the sheet (includes Jeff's corrections; void rows excluded server-side and here).
  function refresh() {
    var db = A.db(); if (!db.session || db.session.authNeeded || !A.endpointReady()) return Promise.resolve();
    return A.api({ action: 'session_check', appKey: S.PUNCH_APP_KEY, sessionToken: db.session.token }).then(function (j) {
      if (!j.ok) { db.lastEmail = A.me() ? A.me().email : db.lastEmail; db.session.authNeeded = true; A.save(); A.flash('Please sign in again. Unsent punches are safe on this phone.', true); return A.render(); }
      db.session.employee = j.employee || db.session.employee; db.session.mustChangePassword = !!j.mustChangePassword;
      if (!j.mustChangePassword) db.punches = WT.mergeServerPunches(db.punches, j.punches || [], db.session.employee.email);
      A.save(); A.render(); A.syncAll();
    }, function () { /* offline: keep local copy */ });
  }

  // ===== sign in =====
  $('loginForm').onsubmit = function (ev) {
    ev.preventDefault(); err('loginErr', '');
    var email = $('lEmail').value.trim().toLowerCase(), pw = $('lPass').value, btn = $('loginBtn');
    if (!email || !pw) return err('loginErr', 'Enter your email and password.');
    busyBtn(btn, true, 'Signing in…');
    A.api({ action: 'login', appKey: S.PUNCH_APP_KEY, email: email, password: pw }).then(function (j) {
      busyBtn(btn, false, 'Sign in');
      if (!j.ok) return err('loginErr', j.error || 'Invalid email or password.');
      $('lPass').value = ''; setSession(j);
      var n = adoptLegacy();
      A.render();
      if (!j.mustChangePassword) { if (n) A.flash(n + ' earlier punch' + (n === 1 ? '' : 'es') + ' from this phone will be sent now.'); refresh(); }
    }, function (e) { busyBtn(btn, false, 'Sign in'); err('loginErr', netMsg(e)); });
  };
  $('toGuest').onclick = function () { A.setScreen('guest'); };

  // ===== forced first-login change =====
  $('forceForm').onsubmit = function (ev) {
    ev.preventDefault(); err('forceErr', '');
    var np = $('fNew').value, problem = WT.passwordProblem(np, $('fConfirm').value), btn = $('forceBtn');
    if (problem) return err('forceErr', problem);
    busyBtn(btn, true, 'Saving…');
    A.api({ action: 'change_password', appKey: S.PUNCH_APP_KEY, sessionToken: A.db().session.token, newPassword: np }).then(function (j) {
      busyBtn(btn, false, 'Save new password');
      if (!j.ok) return err('forceErr', j.error || 'Could not change password.');
      $('fNew').value = $('fConfirm').value = ''; setSession(j); A.flash(j.employee && j.employee.role === 'admin' ? 'Password set.' : 'Password set. You can clock in now.'); A.render(); refresh();
    }, function (e) { busyBtn(btn, false, 'Save new password'); err('forceErr', netMsg(e)); });
  };
  $('forceSignOut').onclick = function () { signOut(); };

  // ===== voluntary change =====
  $('openPw').onclick = function () { err('pwErr', ''); $('pwModal').hidden = false; $('pCur').focus(); };
  $('pwCancel').onclick = function () { $('pwModal').hidden = true; $('pCur').value = $('pNew').value = $('pConfirm').value = ''; };
  $('pwForm').onsubmit = function (ev) {
    ev.preventDefault(); err('pwErr', '');
    var cur = $('pCur').value, np = $('pNew').value, problem = WT.passwordProblem(np, $('pConfirm').value), btn = $('pwBtn');
    if (!cur) return err('pwErr', 'Enter your current password.');
    if (problem) return err('pwErr', problem);
    busyBtn(btn, true, 'Saving…');
    A.api({ action: 'change_password', appKey: S.PUNCH_APP_KEY, sessionToken: A.db().session.token, currentPassword: cur, newPassword: np }).then(function (j) {
      busyBtn(btn, false, 'Change password');
      if (!j.ok) return err('pwErr', j.error || 'Could not change password.');
      setSession(j); $('pwCancel').onclick(); A.flash('Password changed.'); A.render();
    }, function (e) { busyBtn(btn, false, 'Change password'); err('pwErr', netMsg(e)); });
  };

  // ===== sign out (unsent punches stay queued on this phone) =====
  function signOut() {
    var db = A.db(), s = db.session; if (!s) return;
    if (A.endpointReady()) A.api({ action: 'logout', appKey: S.PUNCH_APP_KEY, sessionToken: s.token }).catch(function () {});
    var email = s.employee && s.employee.email;
    db.punches = db.punches.filter(function (p) { return p.ownerEmail !== email || p.syncStatus !== 'synced'; });
    db.lastEmail = email || db.lastEmail; db.session = null; A.save(); A.setScreen('login');
  }
  $('signOut').onclick = signOut;

  // ===== guest punch =====
  function guestFields() { return { name: $('gName').value.trim(), note: $('gNote').value.trim() }; }
  $('guestTypes').innerHTML = Object.keys(WT.TYPES).map(function (t) { return '<button type="button" class="act navy" data-guest="' + t + '">' + WT.TYPES[t] + '</button>'; }).join('');
  $('guestTypes').onclick = function (ev) {
    var b = ev.target.closest('[data-guest]'); if (!b) return;
    var f = guestFields(); err('guestErr', '');
    if (!WT.guestOk(f.name, f.note)) return err('guestErr', 'Enter your full name and a short note identifying yourself (at least 4 characters).');
    A.capture(b.dataset.guest, function (rec) {
      rec.guestName = f.name; rec.guestNote = f.note; rec.name = f.name;
      A.db().guestQueue.push(rec); A.save(); lastGuest = rec; showGuestDone(); A.setScreen('guestDone');
    });
  };
  function showGuestDone() {
    if (!lastGuest) return;
    $('gdWhat').textContent = WT.TYPES[lastGuest.type] + ' at ' + A.shortTime(lastGuest.ts) + ' — ' + WT.locationLabel(lastGuest);
    $('gdState').textContent = lastGuest.syncStatus === 'synced' ? 'Saved and sent to Jeff with a GUEST flag.'
      : 'Saved on this phone. It will send to Jeff automatically as soon as there is a connection.';
  }
  A.on('guestSynced', function (g) { if (lastGuest && g.punch_id === lastGuest.punch_id) showGuestDone(); });
  $('guestBack').onclick = function () { A.setScreen('login'); };
  $('gdBack').onclick = function () { lastGuest = null; A.setScreen('login'); };
  $('gdAgain').onclick = function () { A.setScreen('guest'); };

  A.on('render', function (sc) {
    if (sc === 'login') {
      var db = A.db();
      if (db.lastEmail && !$('lEmail').value) $('lEmail').value = db.lastEmail;
      var waiting = WT.pendingPunches(db.punches).length;
      $('loginWait').hidden = !waiting;
      $('loginWait').textContent = waiting ? waiting + ' unsent punch' + (waiting === 1 ? '' : 'es') + ' saved on this phone — they send after you sign in.' : '';
    }
  });
  A.on('visible', refresh);
  A.start();
  refresh();
})();
