/* Weave Time — admin Employees tab: add accounts, reset passwords, deactivate/remove, and multi-role editing (v5).
   One person can hold several roles (e.g. driver + contractor). driver = route screens; admin = admin view only (no clock);
   any other role (employee, contractor, office, …) = normal clock. Against an older server (no role catalog) roles are single-choice. */
(function () {
  'use strict';
  var A = window.WTApp, X = window.WTA, W = window.WTAdmin; if (!W || !W.need) return;
  var st = W.st, esc = A.esc, $ = function (id) { return document.getElementById(id); };
  var HELP = { employee: 'clock', contractor: 'clock, paid as contractor', office: 'clock', driver: 'clock + Start/End Route', cardholder: 'optional label only; everyone can log receipts', admin: 'admin view, no clock' };
  function rolesOf(u) { return u.roles && u.roles.length ? u.roles : [u.role || 'employee']; }
  function cat() { return st.roleCat || ['employee', 'driver', 'admin']; }
  function multi() { return !!st.roleCat; }
  function pills(u) { return rolesOf(u).map(function (r) { return '<span class="pill ' + (r === 'admin' ? 'p-lunch' : r === 'driver' ? 'p-on' : '') + '">' + esc(r) + '</span>'; }).join(''); }
  function boxes(name, sel, self) {
    return '<div class="ad-row" style="gap:.3rem .9rem">' + cat().map(function (r) {
      var on = sel.indexOf(r) !== -1, lock = self && r === 'admin';
      return '<label style="margin:0;font-size:.95rem;color:#1a1a1a"><input type="' + (multi() ? 'checkbox' : 'radio') + '" name="' + name + '" value="' + esc(r) + '" style="width:auto"' + (on ? ' checked' : '') + (lock ? ' disabled' : '') + '> ' + esc(r) +
        (HELP[r] ? ' <span class="muted">(' + HELP[r] + ')</span>' : '') + '</label>'; }).join('') + '</div>';
  }
  function picked(f, name) { return Array.prototype.filter.call(f.querySelectorAll('input[name="' + name + '"]'), function (x) { return x.checked; }).map(function (x) { return x.value; }); }
  W.views.employees = function () {
    return W.need(function () {
      var me = (A.me() || {}).email;
      return '<details class="ad-card ad-f"><summary><b>Add an employee</b></summary><form id="nuForm"><label for="nuName">Full name</label><input id="nuName" required maxlength="120">' +
        '<label for="nuEmail">Email (their sign-in)</label><input id="nuEmail" type="email" required autocomplete="off"><label for="nuId">Employee ID (optional)</label><input id="nuId" maxlength="60">' +
        '<label for="nuPass">Temporary password (they must change it at first sign-in)</label><input id="nuPass" type="password" value="WeaveMeIn" required autocomplete="new-password">' +
        '<label>Roles' + (multi() ? ' (pick one or more)' : '') + '</label>' + boxes('nuRoles', ['employee'], false) +
        '<div class="row"><button class="go" type="submit">Create account</button></div></form></details>' +
        (multi() ? '<details class="ad-card ad-f"><summary><b>Role list</b> <span class="muted">' + esc(cat().join(', ')) + '</span></summary><p class="muted">Add a new role here, then tick it on people. ' +
          'Only "driver" and "admin" change the main screens (routes or admin). Everyone can log a receipt. cardholder is kept as a label only. Every other role clocks in normally and shows up as its own group in the week report.</p>' +
          '<div class="ad-row"><input id="newRole" class="ad-grow" maxlength="24" placeholder="e.g. painter" autocomplete="off"><button class="ghost btn-s" type="button" id="addRole">Add role</button></div></details>' : '') +
        st.users.map(function (u) {
          var self = u.email === me;
          return '<div class="ad-card"><div class="ad-row"><span class="ad-grow"><b>' + esc(u.full_name) + '</b>' + (u.employee_id ? ' <span class="muted">· ' + esc(u.employee_id) + '</span>' : '') + '<br><span class="muted">' + esc(u.email) + '</span></span>' +
            pills(u) + (u.active ? '' : '<span class="pill p-bad">inactive</span>') + (u.must_change_password ? '<span class="pill">temp password</span>' : '') + '</div>' +
            '<div class="muted">Last sign-in: ' + (u.last_login_utc ? esc(X.ctLabel(u.last_login_utc)) : 'never') + '</div>' +
            '<div class="ad-row" style="margin-top:.4rem"><button class="ghost btn-s" type="button" data-reset="' + esc(u.email) + '">Reset password</button><button class="ghost btn-s" type="button" data-roleedit="' + esc(u.email) + '">Roles…</button>' +
            (self ? '<span class="muted">(you)</span>' : '<button class="ghost btn-s" type="button" data-active="' + esc(u.email) + '" data-to="' + (u.active ? 'false' : 'true') + '">' + (u.active ? 'Deactivate' : 'Reactivate') + '</button>' +
              '<button class="ghost btn-s" type="button" data-remove="' + esc(u.email) + '" style="color:#a32020">Remove</button>') + '</div>' +
            (st.roleFor === u.email ? '<form class="ad-f" data-roleform="' + esc(u.email) + '"><label>Roles for ' + esc(u.full_name) + '</label>' + boxes('r', rolesOf(u), self) +
              (self ? '<p class="muted">You can’t remove your own admin role.</p>' : '') + '<div class="row"><button class="ghost" type="button" data-rolecancel="1">Cancel</button><button class="go" type="submit">Save roles</button></div></form>' : '') +
            (st.resetFor === u.email ? '<form class="ad-f" data-resetform="' + esc(u.email) + '"><label>New temporary password</label><input name="pw" type="password" value="WeaveMeIn" required autocomplete="new-password">' +
              '<div class="row"><button class="ghost" type="button" data-resetcancel="1">Cancel</button><button class="go" type="submit">Reset — signs them out</button></div></form>' : '') + '</div>';
        }).join('');
    });
  };
  function reload(msg) { st.users = null; st.resetFor = st.roleFor = ''; if (msg) A.flash(msg); W.users().then(W.draw, W.fail); }
  function setRoles(email, roles) { return multi() ? { email: email, roles: roles, role: roles.join(',') } : { email: email, role: roles[0] }; }
  document.addEventListener('click', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'employees') return; var t = ev.target, d = t.dataset || {};
    if (d.reset) { st.resetFor = d.reset; st.roleFor = ''; return W.draw(); }
    if (d.resetcancel) { st.resetFor = ''; return W.draw(); }
    if (d.roleedit) { st.roleFor = d.roleedit; st.resetFor = ''; return W.draw(); }
    if (d.rolecancel) { st.roleFor = ''; return W.draw(); }
    if (d.active) return W.call('admin_set_active', { email: d.active, active: d.to === 'true' }).then(function () { reload(d.to === 'true' ? 'Reactivated.' : 'Deactivated — they can no longer sign in.'); }, W.fail);
    if (d.remove) { if (!window.confirm('Remove ' + d.remove + '? Their punches stay in the sheet; they can no longer sign in.')) return; return W.call('admin_delete_user', { email: d.remove }).then(function () { reload('Removed.'); }, W.fail); }
    if (t.id === 'addRole') {
      var n = $('newRole').value.trim().toLowerCase(); if (!/^[a-z][a-z0-9_-]{0,23}$/.test(n)) return A.flash('Role names: letters, numbers, - or _, starting with a letter.', true);
      return W.call('admin_add_role', { name: n }).then(function (j) { st.roleCat = j.roles; A.flash('Role "' + j.added + '" added.'); W.draw(); }, W.fail);
    }
  });
  document.addEventListener('submit', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'employees') return; var f = ev.target;
    if (f.id === 'nuForm') {
      ev.preventDefault(); var rs = picked(f, 'nuRoles'); if (!rs.length) return A.flash('Pick at least one role.', true);
      var b = setRoles($('nuEmail').value.trim().toLowerCase(), rs); b.full_name = $('nuName').value.trim(); b.employee_id = $('nuId').value.trim(); b.initial_password = $('nuPass').value;
      return W.call('admin_create_user', b).then(function (j) { reload('Account created for ' + j.email + '. They sign in with the temporary password and must change it.'); }, W.fail);
    }
    if (f.dataset.roleform) {
      ev.preventDefault(); var email = f.dataset.roleform, r = picked(f, 'r');
      if (email === (A.me() || {}).email && r.indexOf('admin') === -1) r.push('admin');
      if (!r.length) return A.flash('Pick at least one role.', true);
      return W.call('admin_set_role', setRoles(email, r)).then(function () { reload('Roles updated: ' + r.join(', ') + '.'); }, W.fail);
    }
    if (f.dataset.resetform) { ev.preventDefault(); return W.call('admin_reset_password', { email: f.dataset.resetform, initial_password: f.elements.pw.value }).then(function () { reload('Password reset. They must change it at next sign-in.'); }, W.fail); }
  });
})();
