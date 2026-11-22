/* Weave Time v6 — "Upload screenshot to auto-fill" on the driver Start Route and End Route forms.
   Several screenshots at once (gallery or camera) -> on-phone OCR -> only confident labeled values are filled, and only into empty
   fields. Filled fields turn yellow and the driver must tick "I reviewed" before submitting. Each submit logs what was auto-filled vs
   what was finally sent (OcrLearning tab, no photos) so the parser can be tuned. Screenshots can be kept with the route (private Drive). */
(function () {
  'use strict';
  var A = window.WTApp, O = window.WTOcr, M = window.WTMedia, D = window.WTD; if (!A || !O || !M || !D) return;
  var esc = A.esc, st = {}, pending = null;
  var LABELS = { start_packages: 'Total packages', start_stops: 'Stops', overflow_count: 'Overflow', oversize_count: 'Oversize', start_odometer: 'Starting mileage', route: 'Route',
    delivered_packages: 'Delivered', returned_packages: 'Returned / undelivered', missing_packages: 'Missing', damaged_packages: 'Damaged', successful_stops: 'Successful stops',
    unsuccessful_stops: 'Unsuccessful stops', end_odometer: 'Ending mileage' };
  function me() { return A.me() || {}; }
  function draft() { var d = A.db(); d.routeDrafts = d.routeDrafts || {}; var k = me().email || '?'; return d.routeDrafts[k] = d.routeDrafts[k] || { start: { totes: [{}, {}, {}] }, finish: {} }; }
  function formOf(box) { return box.querySelector('[data-drv="finish"]') ? 'end' : box.querySelector('[data-drv="start"]') ? 'start' : ''; }
  function stOf(box) {
    var mode = box.dataset.drvbox, form = formOf(box), s = st[mode];
    if (!s || s.form !== form) { var old = s; if (old) setTimeout(function () { if (!old.enqueued) (old.shots || []).forEach(function (c) { M.store.del(c); }); }, 5000); s = st[mode] = { form: form, filled: {}, shots: [], keep: true }; }
    return s;
  }
  function blank(v) { return v === undefined || v === null || String(v).trim() === ''; }
  function boxHtml(s) {
    var n = Object.keys(s.filled).length, c = Object.keys(s.conflicts || {}), info = s.info || {};
    return '<button class="ghost" type="button" data-af="pick" style="border-style:dashed">📄 Upload screenshot to auto-fill</button>' +
      '<p class="muted" style="margin:.3rem 0">Flex summary / itinerary screens. You can pick several at once. Only numbers the phone is sure about are filled — check them.</p>' +
      (s.status ? '<p class="muted" data-afstatus>' + esc(s.status) + '</p>' : '') +
      (n ? '<p style="color:#7a5c12"><b>Auto-filled (yellow):</b> ' + Object.keys(s.filled).map(function (k) { return esc(LABELS[k] || k) + ' ' + esc(s.filled[k]); }).join(' · ') + '</p>' +
        '<label style="font-size:1rem;color:#1a1a1a"><input type="checkbox" data-af="reviewed" style="width:auto"' + (s.reviewed ? ' checked' : '') + '> I reviewed the yellow auto-filled fields</label>' : '') +
      (c.length ? '<p class="muted">Not filled — screens disagree: ' + c.map(function (k) { return esc(LABELS[k] || k) + ' (' + esc(s.conflicts[k].join(' / ')) + ')'; }).join(', ') + '</p>' : '') +
      (s.kept && s.kept.length ? '<p class="muted">Kept what you typed for: ' + s.kept.map(function (k) { return esc(LABELS[k] || k); }).join(', ') + '</p>' : '') +
      (Object.keys(info).length ? '<p class="muted">Also seen (not a form field): ' + Object.keys(info).map(function (k) { return esc(k.replace(/_/g, ' ')) + ' ' + esc(info[k]); }).join(' · ') + '</p>' : '') +
      (s.shots.length ? '<label style="font-size:.95rem;color:#1a1a1a"><input type="checkbox" data-af="keep" style="width:auto"' + (s.keep ? ' checked' : '') + '> Keep the ' + s.shots.length + ' screenshot(s) with this route (private, Jeff only)</label>' : '') +
      (s.raw !== undefined ? '<details><summary class="muted">What the phone read (raw text)</summary><pre style="white-space:pre-wrap;font-size:.72rem;max-height:16rem;overflow:auto">' + esc(s.raw || '(no text found)') + '</pre></details>' : '');
  }
  function decorate(box) {
    var form = formOf(box); if (!form) return;
    var s = stOf(box), el = box.querySelector('.wt-af');
    if (!el) { el = document.createElement('div'); el.className = 'wt-af'; el.style.cssText = 'margin:.4rem 0 .8rem;padding:.6rem;border-radius:10px;background:#f6f3ec'; var h = box.querySelector('h2'); if (h && h.nextSibling) box.insertBefore(el, h.nextSibling); else box.insertBefore(el, box.firstChild); el.dataset.k = ''; }
    var html = boxHtml(s); if (el.dataset.k !== html) { el.innerHTML = html; el.dataset.k = html; }
    Object.keys(s.filled).forEach(function (k) { var i = box.querySelector('[data-f="' + k + '"]'); if (i && i.style.background !== 'rgb(255, 244, 194)') { i.style.background = '#fff4c2'; i.title = 'Auto-filled from a screenshot. Check it.'; } });
  }
  var obs = new MutationObserver(function () { document.querySelectorAll('[data-drvbox]').forEach(function (b) { if (b.querySelector('[data-drv]')) decorate(b); }); });
  obs.observe(document.body, { childList: true, subtree: true });
  function boxOf(t) { return t.closest('[data-drvbox]'); }
  function redraw(box) { var y = window.scrollY; if (window.WTDriver) window.WTDriver.mount(box.id, box.dataset.drvbox === 'preview'); decorate(box); window.scrollTo(0, y); }

  function apply(box, s, parsed) {
    var d = draft(), f = s.form === 'end' ? d.finish : d.start; s.kept = []; s.conflicts = parsed.conflicts; s.info = parsed.info; s.screen = parsed.screen; s.tried = parsed.fieldsTried;
    Object.keys(parsed.fields).forEach(function (k) {
      var v = parsed.fields[k];
      if (k === 'route') { if (blank(f.route)) { f.route = v; s.filled.route = v; } else if (f.route !== v) s.kept.push(k); return; }
      if (blank(f[k]) || s.filled[k] === String(f[k])) { f[k] = v; s.filled[k] = v; } else if (String(f[k]) !== v) s.kept.push(k);
    });
    s.reviewed = false; A.save();
  }
  function handleFiles(box, files) {
    var s = stOf(box), list = Array.prototype.slice.call(files || [], 0, 8), texts = [];
    if (!list.length) return; s.busy = true;
    var step = function (i) {
      if (i >= list.length) return Promise.resolve();
      s.status = 'Reading screenshot ' + (i + 1) + ' of ' + list.length + '… (first time can take a minute)'; decorate(box);
      return M.prepare(list[i]).then(function (p) {
        var cid = M.newId('s'); s.shots.push(cid); M.store.put(cid, p.upload).catch(function () { s.shots = s.shots.filter(function (x) { return x !== cid; }); });
        return M.ocr(p.ocrCanvas, function (pct) { var e = box.querySelector('[data-afstatus]'); if (e) e.textContent = 'Reading screenshot ' + (i + 1) + ' of ' + list.length + '… ' + pct + '%'; });
      }).then(function (t) { texts.push(t); }, function (e) { texts.push(''); s.lastErr = e && e.message; }).then(function () { return step(i + 1); });
    };
    step(0).then(function () {
      s.busy = false; s.images = (s.images || 0) + list.length; s.raw = (s.raw ? s.raw + '\n\n----\n\n' : '') + texts.join('\n\n----\n\n');
      var parsed = O.parseScreens(s.raw, s.form, D.ROUTES); apply(box, s, parsed);
      var n = Object.keys(s.filled).length;
      s.status = n ? 'Filled ' + n + ' field(s). Check the yellow ones, fill the rest, then tick “I reviewed”.' : (s.lastErr ? s.lastErr : 'Could not find numbers I am sure about. Fill the form by hand (the raw text is below).');
      redraw(box);
    });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-af="pick"]'); if (!b) return; var box = boxOf(b); if (!box) return;
    if (stOf(box).busy) return A.flash('Still reading the last screenshots…', true);
    pickFor = box.dataset.drvbox; picker.value = ''; picker.click();
  });
  // one file input outside the form, so a form redraw while the picker is open never loses the chosen files
  var pickFor = '', picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.multiple = true; picker.hidden = true; document.body.appendChild(picker);
  picker.addEventListener('change', function () { var box = document.querySelector('[data-drvbox="' + pickFor + '"]'); if (box && picker.files && picker.files.length) handleFiles(box, picker.files); });
  document.addEventListener('change', function (ev) {
    var t = ev.target, box = boxOf(t); if (!box || !t.dataset.af) return; var s = stOf(box);
    if (t.dataset.af === 'reviewed') s.reviewed = t.checked;
    if (t.dataset.af === 'keep') s.keep = t.checked;
  });
  function finalOf(s, f) {
    var out = {}; (s.tried || Object.keys(s.filled)).forEach(function (k) { out[k] = k === 'route' ? (f.route === 'Other' ? f.routeOther || '' : f.route || '') : (f[k] == null ? '' : String(f[k])); }); return out;
  }
  // Runs BEFORE driver.js's own click handler (capture phase): block until reviewed, and remember what is about to be sent.
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-drv="start"],[data-drv="finish"]'); if (!b) return; var box = boxOf(b); if (!box) return;
    var s = st[box.dataset.drvbox]; if (!s || s.form !== formOf(box) || s.raw === undefined) return;
    if (Object.keys(s.filled).length && !s.reviewed) { ev.preventDefault(); ev.stopImmediatePropagation(); A.flash('Check the yellow auto-filled fields, then tick “I reviewed”.', true); var c = box.querySelector('[data-af="reviewed"]'); if (c) c.scrollIntoView({ block: 'center' }); return; }
    var d = draft(), f = s.form === 'end' ? d.finish : d.start, rs = (A.db().routes || []).filter(function (r) { return r.email === me().email; });
    pending = { box: box, s: s, final: finalOf(s, f), before: rs.map(function (r) { return r.cid + (r.finish ? 'f' : ''); }) };
    setTimeout(check, 80);
  }, true);
  function check() {
    var p = pending; pending = null; if (!p) return; var rs = (A.db().routes || []).filter(function (r) { return r.email === me().email; });
    var r = rs.filter(function (x) { return p.before.indexOf(x.cid + (x.finish ? 'f' : '')) === -1; })[0]; if (!r) return;   // validation failed: nothing was submitted
    var s = p.s; s.enqueued = true; var U = window.WTUnd, isT = !!(r.start && r.start.is_test) || me().role === 'admin';
    if (U) {
      U.enqueue({ type: 'ocrlog', cid: M.newId('o'), routeCid: r.cid, payload: { form: s.form, screen_type: s.screen || 'unknown', image_count: s.images || 0, ocr_text: s.raw, autofilled: s.filled,
        final: p.final, parser_fields: s.tried || [], parser_version: O.PARSER_VERSION, is_test: isT } });
      s.shots.forEach(function (c) { if (s.keep) U.enqueue({ type: 'shot', cid: c, routeCid: r.cid, kind: s.form }); else M.store.del(c); });
    }
    if (st[p.box.dataset.drvbox] === s) delete st[p.box.dataset.drvbox];
  }
})();
