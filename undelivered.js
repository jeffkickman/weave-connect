/* Weave Time — undelivered card (label photo, TBA, reason), Post to group, upload queue. */
(function () {
  'use strict';
  var A = window.WTApp, O = window.WTOcr, M = window.WTMedia; if (!A || !O || !M) return;
  var esc = A.esc, S = A.settings, $ = function (id) { return document.getElementById(id); };
  var serverItems = {}, lastList = {}, busy = false, mounts = { undCard: false };
  function db() { var d = A.db(); d.undItems = d.undItems || []; d.wtJobs = d.wtJobs || []; d.routes = d.routes || []; return d; }
  function me() { return A.me() || {}; }
  function routesFor(preview) { var e = me().email; return db().routes.filter(function (r) { return r.email === e && !!r.preview === !!preview; }); }
  function isToday(r) { return r.startedAt && WT.dateKey(Date.parse(r.startedAt)) === WT.dateKey(Date.now()); }
  function openRoute(preview) { return routesFor(preview).filter(function (r) { return (!r.finish || r.finishSync === 'error') && r.startSync !== 'error'; })[0] || null; }
  function target(preview) { var o = openRoute(preview); if (o) return o; var f = routesFor(preview).filter(function (r) { return r.finish && isToday(r); }); return f[f.length - 1] || null; }
  function isTest(r) { return !!(r.start && r.start.is_test) || !!(r.server && r.server.is_test === true); }
  function testNow() { return !!(A.inTestMode && A.inTestMode()); }
  function formKey(preview) { return (me().email || '?') + (preview ? ':p' : ':d'); }
  function form(preview) { var d = db(); d.undDrafts = d.undDrafts || {}; var k = formKey(preview); return d.undDrafts[k] = d.undDrafts[k] || {}; }
  function items(r) {
    var loc = db().undItems.filter(function (x) { return x.routeCid === r.cid; }), seen = {}; loc.forEach(function (x) { seen[x.cid] = 1; });
    (serverItems[r.cid] || []).forEach(function (s) { if (!seen[s.client_id]) loc.push({ cid: s.client_id, routeCid: r.cid, tba: s.tba, reason: s.reason, note: s.note, sync: 'synced', server: s }); });
    return loc;
  }
  function call(body) { var s = db().session || {}; body.appKey = S.PUNCH_APP_KEY; body.sessionToken = s.token; return A.api(body); }
  function canSend() { var s = db().session; return s && !s.authNeeded && !s.mustChangePassword && A.endpointReady() && (me().role === 'driver' || me().role === 'admin'); }
  function syncTag(x) {
    return x.sync === 'synced' ? '<span class="tag on">saved</span>' : x.sync === 'waiting' ? '<span class="tag na">on phone — server update needed</span>' :
      x.sync === 'error' ? '<span class="tag off">' + esc(x.err || 'not saved') + '</span>' : '<span class="tag na">on phone — sending…</span>';
  }
  function postBtn(r) {
    var sv = r.server || {}, st = sv.end_post_status, b = function (label, dis, note) { return '<button class="' + (dis ? 'ghost' : 'go') + ' sm" type="button" data-und="post" data-cid="' + esc(r.cid) + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>' + (note ? ' <span class="muted">' + note + '</span>' : ''); };
    if (isTest(r)) return b('Post to group', true, 'Test route, not posted');
    if (st === 'posted') return b('Posted', true, '');
    if (sv.post_requested === 'TRUE' || r.postAsked) return b('Queued, Atlas will post it', true, '');
    if (r.finishSync !== 'synced') return b('Post to group', true, 'saving the route first…');
    return b('Post to group', false, '');
  }
  function body(preview) {
    var r = target(preview); if (!r) return '';
    var f = form(preview), list = items(r), open = !r.finish || r.finishSync === 'error', fin = routesFor(preview).filter(function (x) { return x.finish && isToday(x) && x.finishSync !== 'error'; });
    var test = isTest(r) || testNow(), tp = f.tba ? O.tbaProblem(f.tba) : '', help = (f.reason && O.REASON_HELP && O.REASON_HELP[f.reason]) ? '<p class="muted">' + esc(O.REASON_HELP[f.reason]) + '</p>' : '';
    var h = '<h2>Undelivered packages — ' + esc(r.start.route_name) + (isTest(r) ? ' <span class="tag off">TEST</span>' : '') + '</h2>';
    if (!f.entry) h += '<p class="muted">Log each package you bring back. Jeff / Atlas use this for Amazon disputes.</p><button class="go sm" type="button" data-und="open">' + (test ? 'Add TEST package' : 'Add undelivered package') + '</button>';
    else h += '<p class="muted">Photo of the label, check the TBA, pick a reason.</p>' +
      '<button class="ghost" type="button" data-und="pick" style="border-style:dashed">📷 Take photo of label</button>' +
      (f.thumb ? '<img src="' + f.thumb + '" alt="label photo" style="max-width:140px;border-radius:8px;margin:.4rem 0">' : '') +
      (f.status ? '<p class="muted" data-ustatus>' + esc(f.status) + '</p>' : '') +
      '<label>TBA number</label><input data-uf="tba" value="' + esc(f.tba || '') + '" autocomplete="off" autocapitalize="characters" placeholder="TBA + 12 digits"' + (f.fromOcr ? ' style="background:#fff4c2"' : '') + '>' +
      (tp ? '<p class="muted" data-tbawarn style="color:#8a6d1f">' + esc(tp.replace(/^warn:/, '')) + '</p>' : '<p class="muted" data-tbawarn></p>') +
      '<label style="font-size:1rem;color:#1a1a1a"><input type="checkbox" data-uf="confirmed" style="width:auto"' + (f.confirmed ? ' checked' : '') + '> I checked this TBA on the label</label>' +
      (f.ocrText !== undefined ? '<details><summary class="muted">What the phone read from the photo</summary><pre style="white-space:pre-wrap;font-size:.75rem">' + esc(f.ocrText || '(no text found)') + '</pre></details>' : '') +
      '<label>Why wasn’t it delivered? (required)</label><select data-uf="reason"><option value="">Choose…</option>' + O.REASONS.map(function (x) { return '<option' + (x === f.reason ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' + help +
      '<label>Note' + (/^Other/.test(f.reason || '') ? ' (required)' : ' (optional)') + '</label><textarea data-uf="note" rows="2" maxlength="500">' + esc(f.note || '') + '</textarea>' +
      '<p class="err" data-uerr hidden></p><div class="row"><button class="ghost" type="button" data-und="back">Back</button><button class="ghost" type="button" data-und="clear">Clear form</button></div>' +
      '<button class="navy" type="button" data-und="add">' + (test ? 'Submit TEST package' : 'Add package') + '</button>';
    h += list.length ? '<h2 style="margin-top:1rem">Logged (' + list.length + ')</h2><ul class="pl">' + list.map(function (x) {
      return '<li><b>' + esc(x.tba) + '</b> · ' + esc(x.reason) + (x.note ? ' — ' + esc(x.note) : '') + ' ' + syncTag(x) + (x.photoErr ? ' <span class="muted">(photo not saved)</span>' : '') +
        (open || x.sync !== 'synced' ? ' <button class="ghost sm" type="button" data-und="del" data-cid="' + esc(x.cid) + '">Delete</button>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="muted">None logged for this route yet.</p>';
    if (fin.length) h += '<h2 style="margin-top:1rem">Post to the group</h2><p class="muted">After you finish, tap Post. Atlas posts the numbers and undelivered list.</p><ul class="pl">' +
      fin.map(function (x) { return '<li><b>' + esc(x.start.route_name) + '</b> · ' + items(x).length + ' undelivered logged<div class="row">' + postBtn(x) + '</div></li>'; }).join('') + '</ul>';
    return h;
  }
  function paint(el, preview, force) {
    if (!el) return; var r = target(preview), f = form(preview);
    var key = JSON.stringify([!!r && r.cid, r && [r.finish ? 1 : 0, r.finishSync, r.server && r.server.post_requested, r.server && r.server.end_post_status, r.postAsked], db().undItems.map(function (x) { return x.cid + x.sync; }), routesFor(preview).length, f.v || 0, (serverItems[r && r.cid] || []).length]);
    if (!force && el.dataset.k === key) return; el.dataset.k = key; var html = body(preview); el.hidden = !html; el.innerHTML = html;
  }
  function repaint(force) { for (var id in mounts) { if (id === 'undCard' && !(A.currentScreen() === 'app' && me().role === 'driver')) continue; if (id !== 'undCard' && A.currentScreen() !== 'admin') continue; paint($(id), mounts[id], force); } }
  function holder(t) { var h = t.closest('[data-undbox]'); return h ? { el: h, preview: h.dataset.undbox === 'preview' } : null; }
  function bump(h) { var f = form(h.preview); f.v = (f.v || 0) + 1; var y = window.scrollY; paint(h.el, h.preview, true); window.scrollTo(0, y); }

  document.addEventListener('input', function (ev) {
    var t = ev.target, h = holder(t); if (!h || !t.dataset.uf) return; var f = form(h.preview), k = t.dataset.uf;
    f[k] = t.type === 'checkbox' ? t.checked : t.value; A.save();
    if (k === 'tba') { f.fromOcr = false; var w = h.el.querySelector('[data-tbawarn]'), p = f.tba ? O.tbaProblem(f.tba) : ''; if (w) w.textContent = p.replace(/^warn:/, ''); }
    if (k === 'reason') bump(h);
  });
  // camera input lives outside the card so a redraw never drops the photo
  var pickFor = null, picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.setAttribute('capture', 'environment'); picker.hidden = true; document.body.appendChild(picker);
  picker.addEventListener('change', function () {
    var el = pickFor && document.querySelector('[data-undbox="' + pickFor + '"]'); if (!el || !picker.files || !picker.files[0]) return;
    var h = { el: el, preview: pickFor === 'preview' }, f = form(h.preview), file = picker.files[0]; f.status = 'Getting the photo ready…'; f.ocrText = undefined; f.confirmed = false; bump(h);
    M.prepare(file).then(function (p) {
      f.blob = p.upload; f.thumb = p.thumb; f.status = 'Reading the label… (first time can take a minute)'; bump(h);
      return M.ocr(p.ocrCanvas, function (pct) { f.status = 'Reading the label… ' + pct + '%'; var s = h.el.querySelector('[data-ustatus]'); if (s) s.textContent = f.status; });
    }).then(function (text) {
      var m = O.extractTba(text); f.ocrText = text;
      if (m.best) { f.tba = m.best; f.fromOcr = true; f.status = 'Found ' + m.best + '. Check it matches the label, then tick the box.'; }
      else f.status = m.matches.length ? 'Found more than one TBA (' + m.matches.join(', ') + '). Type the right one.' : 'Could not read a TBA number. Type it from the label.';
      bump(h);
    }).catch(function (e) { f.status = (e && e.message) || 'Could not read the photo. Type the TBA from the label.'; f.ocrText = f.ocrText || ''; bump(h); });
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-und]'); if (!b) return; var h = holder(b); if (!h) return; var a = b.dataset.und, f = form(h.preview), r = target(h.preview); if (!r) return;
    if (a === 'open') { f.entry = true; A.save(); return bump(h); }
    if (a === 'back') { f.entry = false; A.save(); return bump(h); }
    if (a === 'clear') { if (!window.confirm('Clear unsaved TBA, photo, reason and note? Logged packages stay.')) return; db().undDrafts[formKey(h.preview)] = { entry: true }; A.save(); return bump(h); }
    if (a === 'pick') { pickFor = h.el.dataset.undbox; picker.value = ''; return picker.click(); }
    var err = function (m) { var p = h.el.querySelector('[data-uerr]'); if (p) { p.textContent = m; p.hidden = !m; } if (m) A.flash(m, true); };
    if (a === 'add') {
      var tba = O.normTba(f.tba), p = O.tbaProblem(tba), test = isTest(r) || testNow();
      if (p && !/^warn:/.test(p)) return err(p);
      if (!f.confirmed) return err('Check the TBA against the label and tick the box.');
      if (!f.reason) return err('Choose why it was not delivered.');
      if (/^Other/.test(f.reason) && String(f.note || '').trim().length < 3) return err('Add a note for "Other".');
      if (items(r).some(function (x) { return x.tba === tba; })) return err(tba + ' is already on the list.');
      var it = { cid: M.newId('u'), email: me().email, routeCid: r.cid, tba: tba, reason: f.reason, note: String(f.note || '').trim(), ocr_text: f.ocrText || '', hasPhoto: !!f.blob, sync: 'pending', createdAt: new Date().toISOString() };
      var save = function () { db().undItems.push(it); db().undDrafts[formKey(h.preview)] = {}; A.save(); A.flash('Added ' + tba + (test ? ' (TEST)' : '') + '.'); bump(h); run(); };
      return f.blob ? M.store.put(it.cid, f.blob).then(save, function () { it.hasPhoto = false; it.photoErr = true; save(); }) : save();
    }
    if (a === 'del') {
      var x = items(r).filter(function (y) { return y.cid === b.dataset.cid; })[0]; if (!x || !window.confirm('Delete ' + x.tba + '?')) return;
      var drop = function () { db().undItems = db().undItems.filter(function (y) { return y.cid !== x.cid; }); serverItems[r.cid] = (serverItems[r.cid] || []).filter(function (s) { return s.client_id !== x.cid; }); M.store.del(x.cid); A.save(); bump(h); };
      if (x.sync !== 'synced') return drop();
      return call({ action: 'undelivered_delete', id: x.server.id }).then(function (j) { if (j.ok) drop(); else A.flash(j.error || 'Not deleted', true); }, function () { A.flash('No connection. Try again.', true); });
    }
    if (a === 'post') {
      var rr = db().routes.filter(function (y) { return y.cid === b.dataset.cid; })[0]; if (!rr || !rr.route_id) return;
      b.disabled = true;
      call({ action: 'route_request_post', route_id: rr.route_id, client_route_id: rr.cid }).then(function (j) {
        if (j.ok) { rr.server = j.route; rr.postAsked = true; A.save(); A.flash('Queued. Atlas will post it in the group.'); }
        else if (/Unknown action/i.test(j.error || '')) A.flash('Server update needed before Post works. Atlas will still see the finished route.', true);
        else A.flash(j.error || 'Not queued', true);
        bump(h);
      }, function () { b.disabled = false; A.flash('No connection. Try again.', true); });
    }
  });

  // ===== upload queue (label photos, screenshots, OCR-learning logs) =====
  function routeOf(cid) { return db().routes.filter(function (r) { return r.cid === cid; })[0] || null; }
  function sendItem(x) {
    var r = routeOf(x.routeCid); if (!r || !r.route_id) return Promise.resolve(true);   // wait for the route to reach the server
    return (x.hasPhoto ? M.store.get(x.cid).then(function (b) { return b ? M.b64(b) : ''; }).catch(function () { return ''; }) : Promise.resolve('')).then(function (ph) {
      return call({ action: 'undelivered_add', client_id: x.cid, route_id: r.route_id, route_client_id: r.cid, tba: x.tba, tba_confirmed: true, reason: x.reason, note: x.note, ocr_text: x.ocr_text, photo_b64: ph || undefined });
    }).then(function (j) {
      if (j.ok) { x.sync = 'synced'; x.server = j.item; x.photoErr = !!j.photo_error || (x.hasPhoto && !j.item.photo_url); M.store.del(x.cid); return true; }
      if (j.authError) { A.authLost(); return false; }
      if (/Unknown action/i.test(j.error || '')) { x.sync = 'waiting'; return false; }
      if (j.routeNotFound) return true;
      x.sync = 'error'; x.err = j.error || 'Not saved'; return true;
    });
  }
  function sendJob(job) {
    var r = routeOf(job.routeCid); if (job.type === 'shot' && (!r || !r.route_id)) return Promise.resolve(true);
    if (job.type === 'ocrlog' && r && !r.route_id && r.startSync !== 'error' && Date.now() - Date.parse(job.at) < 864e5) return Promise.resolve(true);
    var p = job.type === 'shot' ? M.store.get(job.cid).then(function (b) { return b ? M.b64(b) : ''; }).then(function (ph) {
      if (!ph) { job.done = true; return { ok: true }; }
      return call({ action: 'route_screenshot', client_id: job.cid, route_id: r.route_id, route_client_id: r.cid, kind: job.kind, photo_b64: ph });
    }) : call(Object.assign({ action: 'ocr_learning_log', client_id: job.cid, route_id: r && r.route_id, route_client_id: job.routeCid }, job.payload));
    return p.then(function (j) {
      if (j.ok || j.duplicate) { job.done = true; if (job.type === 'shot') M.store.del(job.cid); return true; }
      if (j.authError) { A.authLost(); return false; }
      if (/Unknown action/i.test(j.error || '')) return false;
      job.tries = (job.tries || 0) + 1; if (job.tries > 5) { job.done = true; M.store.del(job.cid); } return true;
    });
  }
  function run() {
    if (busy || !canSend()) return Promise.resolve(); busy = true; var d = db(), e = me().email, jobs = [];
    d.undItems.filter(function (x) { return x.email === e && (x.sync === 'pending' || x.sync === 'waiting'); }).forEach(function (x) { jobs.push(function () { return sendItem(x); }); });
    d.wtJobs.filter(function (j) { return j.email === e && !j.done; }).forEach(function (j) { jobs.push(function () { return sendJob(j); }); });
    var chain = Promise.resolve(true);
    jobs.forEach(function (job) { chain = chain.then(function (ok) { return ok ? Promise.resolve(job()).catch(function () { return false; }) : false; }); });
    var fin = function () {
      busy = false; var wk = Date.now() - 8 * 864e5;
      d.wtJobs = d.wtJobs.filter(function (j) { return !j.done && Date.parse(j.at) > wk; });
      d.undItems = d.undItems.filter(function (x) { return x.sync !== 'synced' || Date.parse(x.createdAt) > Date.now() - 2 * 864e5; });
      A.save(); repaint();
    };
    return chain.then(fin, fin);
  }
  function refreshList() {
    if (!canSend()) return; [false, true].forEach(function (pv) {
      var r = target(pv); if (!r || !r.route_id || Date.now() - (lastList[r.cid] || 0) < 60000) return; lastList[r.cid] = Date.now();
      call({ action: 'undelivered_list', route_id: r.route_id }).then(function (j) { if (j.ok) { serverItems[r.cid] = j.items || []; repaint(); } }, function () {});
    });
  }
  A.on('render', function (sc) { var el = $('undCard'); if (!el) return; var show = sc === 'app' && me().role === 'driver'; if (!show) { el.hidden = true; return; } paint(el, false); run(); refreshList(); });
  A.on('visible', function () { run(); refreshList(); repaint(); });
  window.addEventListener('online', function () { run(); });
  setInterval(function () { run(); refreshList(); }, 30000); setInterval(function () { repaint(); }, 4000);
  document.addEventListener('click', function (ev) { if (ev.target.closest('[data-drv]')) setTimeout(function () { repaint(); run(); }, 600); });
  window.WTUnd = {
    mount: function (id, preview) { mounts[id] = !!preview; paint($(id), !!preview, true); run(); refreshList(); },
    enqueue: function (job) { job.email = me().email; job.at = new Date().toISOString(); db().wtJobs.push(job); A.save(); setTimeout(run, 500); },
    repaint: repaint, run: run
  };
})();
