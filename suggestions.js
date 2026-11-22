/* Weave Time v7 — "Suggest an idea", for every signed-in role. Optional screenshot (compressed on the phone, private Drive).
   Text stays on the phone until the server says ok; retrying uses the same client_id so it never makes duplicate suggestions.
   Own past suggestions + status below the form. The admin's internal note is not sent to staff. */
(function () {
  'use strict';
  var A = window.WTApp, M = window.WTMedia; if (!A || !M) return;
  var esc = A.esc, S = A.settings, open = false, sending = false, blob = null, thumb = '', items = [], status = '', unsupported = false, loaded = 0, owner = '';
  var CATS = ['Clock', 'Driver/route', 'Photos & auto-fill', 'Hours/history', 'Other'];
  var modal = document.createElement('div'); modal.id = 'ideaModal'; modal.className = 'modal'; modal.hidden = true; document.body.appendChild(modal);
  var picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.hidden = true; document.body.appendChild(picker);
  function me() { return A.me() || {}; }
  function db() { var d = A.db(); d.ideaDrafts = d.ideaDrafts || {}; return d; }
  function draft() { var d = db(), k = me().email; return d.ideaDrafts[k] = d.ideaDrafts[k] || { category: '', text: '', cid: M.newId('idea') }; }
  function call(b) { var s = db().session || {}; b.appKey = S.PUNCH_APP_KEY; b.sessionToken = s.token; return A.api(b); }
  function allowed() { var s = db().session || {}; return s.token && !s.authNeeded && !s.mustChangePassword; }
  function load() {
    if (!allowed() || !A.endpointReady()) return; loaded = Date.now();
    call({ action: 'suggestion_list' }).then(function (j) {
      if (j.ok) { items = (j.items || []).sort(function (a, b) { return Date.parse(b.created_utc) - Date.parse(a.created_utc); }); unsupported = false; }
      else if (/Unknown action/i.test(j.error || '')) unsupported = true;
      else if (j.authError) A.authLost();
      if (open) draw();
    }, function () { if (open) { status = 'Could not load past ideas (no connection?). Your draft is safe.'; draw(); } });
  }
  function draw() {
    if (!open) return; var f = draft(); modal.hidden = false;
    modal.innerHTML = '<div class="card" style="max-height:90vh;overflow:auto;width:min(100%,520px)"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Suggest an idea</h2><button class="ghost sm" type="button" data-idea="close" style="width:auto">Close</button></div>' +
      '<p class="muted">What could make Weave Time better? Jeff reads these. Please don’t include passwords, customer info or pay details.</p>' +
      (unsupported ? '<p class="banner">Server update needed before ideas can be sent. Your draft stays on this phone.</p>' : '') +
      '<label>Category</label><select data-if="category"><option value="">Choose…</option>' + CATS.map(function (c) { return '<option' + (f.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select>' +
      '<label>Your idea (required)</label><textarea data-if="text" rows="4" maxlength="1000" placeholder="e.g. A bigger Clock Out button…">' + esc(f.text) + '</textarea>' +
      '<p class="muted" data-ilen style="margin:.25rem 0">' + String(f.text || '').length + '/1000</p>' +
      '<button class="ghost sm" type="button" data-idea="photo">' + (blob ? 'Change screenshot' : '+ Add screenshot (optional)') + '</button>' +
      (thumb ? '<div class="row"><img src="' + thumb + '" alt="screenshot to send" style="max-width:120px;max-height:140px;border-radius:8px"><button class="ghost sm" type="button" data-idea="remove" style="width:auto">Remove</button></div>' : '') +
      (status ? '<p class="muted" role="status">' + esc(status) + '</p>' : '') +
      '<button class="go" type="button" data-idea="send"' + (sending ? ' disabled' : '') + '>' + (sending ? 'Sending…' : 'Send to Jeff') + '</button>' +
      '<h2 style="margin-top:1rem">My past ideas</h2><button class="ghost sm" type="button" data-idea="refresh" style="width:auto">Refresh</button>' +
      (items.length ? '<ul class="pl">' + items.map(function (x) { return '<li><span class="tag ' + (x.status === 'done' ? 'on' : x.status === 'declined' ? 'off' : 'na') + '">' + esc(x.status) + '</span> <b>' + esc(x.category) + '</b> · <small>' + esc(new Date(x.created_utc).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })) + '</small><div style="white-space:pre-wrap">' + esc(x.text) + '</div>' + (x.has_screenshot ? '<small class="muted">Screenshot attached</small>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="muted">' + (unsupported ? 'Available after the server update.' : 'No ideas sent yet.') + '</p>') + '</div>';
  }
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t.closest('#ideaModal') || !t.dataset.if) return; var f = draft(); f[t.dataset.if] = t.value; A.save();
    var n = modal.querySelector('[data-ilen]'); if (n) n.textContent = String(f.text || '').length + '/1000';
  });
  picker.addEventListener('change', function () {
    if (!picker.files || !picker.files[0]) return; status = 'Getting the screenshot ready…'; draw();
    M.prepare(picker.files[0]).then(function (p) { blob = p.upload; thumb = p.thumb; status = ''; draw(); }, function (e) { status = e.message || 'Could not read that photo.'; draw(); });
  });
  function send() {
    if (sending) return; var f = draft(), text = String(f.text || '').trim();
    if (!f.category) { status = 'Choose a category.'; return draw(); }
    if (text.length < 3) { status = 'Write your idea first.'; return draw(); }
    if (text.length > 1000) { status = 'Please keep it under 1000 characters.'; return draw(); }
    sending = true; status = ''; draw();
    (blob ? M.b64(blob) : Promise.resolve('')).then(function (ph) { return call({ action: 'suggestion_add', client_id: f.cid, category: f.category, text: text, photo_b64: ph || undefined }); }).then(function (j) {
      sending = false;
      if (j.ok) {
        db().ideaDrafts[me().email] = { category: '', text: '', cid: M.newId('idea') }; A.save(); blob = null; thumb = ''; status = 'Thanks, sent to Jeff'; unsupported = false; draw(); load();
      } else {
        if (/Unknown action/i.test(j.error || '')) { unsupported = true; status = 'Server update needed. Your draft is safe on this phone; try again after the update.'; }
        else if (j.authError) { A.authLost(); status = 'Sign in again. Your draft is safe.'; }
        else status = j.error || 'Not sent. Please try again.';
        draw();
      }
    }, function () { sending = false; status = 'Not sent (no connection?). Your draft is safe. Try again.'; draw(); });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-idea]'); if (!b) return; var a = b.dataset.idea;
    if (a === 'open') { if (!allowed()) return; open = true; status = ''; draw(); if (Date.now() - loaded > 30000) load(); }
    if (a === 'close') { open = false; modal.hidden = true; }
    if (a === 'photo') { picker.value = ''; picker.click(); }
    if (a === 'remove') { blob = null; thumb = ''; draw(); }
    if (a === 'send') send();
    if (a === 'refresh') load();
  });
  modal.addEventListener('click', function (ev) { if (ev.target === modal) { open = false; modal.hidden = true; } });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') { open = false; modal.hidden = true; } });
  function upd(sc) {
    var e = me().email || '', ok = (sc === 'app' || sc === 'admin') && allowed();
    if (owner !== e) { owner = e; items = []; blob = null; thumb = ''; loaded = 0; status = ''; unsupported = false; }
    document.querySelectorAll('[data-idea="open"]').forEach(function (b) { b.hidden = !ok; });
    if (!ok) { open = false; modal.hidden = true; }
  }
  A.on('render', upd); upd(A.currentScreen());
})();
