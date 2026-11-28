/* Weave Time — Log a receipt (all signed-in staff). Photos compressed on the phone; optional OCR fills only confident values (yellow + review tick). */
(function () {
  'use strict';
  var A = window.WTApp, M = window.WTMedia, R = window.WTReceipts; if (!A || !M || !R) return;
  var esc = A.esc, S = A.settings, open = false, sending = false, status = '', unsupported = false, loaded = 0, owner = '', items = [], jobs = R.JOBS, myCards = [], filled = {}, reviewed = false, ocrRaw = '', ocrBusy = false;
  var photos = [];
  var modal = document.createElement('div'); modal.id = 'cardModal'; modal.className = 'modal'; modal.hidden = true; document.body.appendChild(modal);
  var picker = document.createElement('input'); picker.type = 'file'; picker.accept = 'image/*'; picker.multiple = true; picker.hidden = true; document.body.appendChild(picker);
  function me() { return A.me() || {}; }
  function db() { var d = A.db(); d.cardDrafts = d.cardDrafts || {}; d.cardPref = d.cardPref || {}; return d; }
  function pref() { return db().cardPref[me().email] || {}; }
  function blank() { var p = pref(); return { charge_date: R.todayCt(), amount: '', merchant: '', payment_type: p.payment_type || '', card_id: p.card_id || '', card_last4: p.card_last4 || '', paid_with: p.paid_with || '', purpose: '', job_property: '', note: '', cid: M.newId('cr') }; }
  function draft() { var d = db(), k = me().email; return d.cardDrafts[k] = d.cardDrafts[k] || blank(); }
  function allowed() { var s = db().session || {}; return s.token && !s.authNeeded && !s.mustChangePassword; }
  function testNow() { return !!(A.inTestMode && A.inTestMode() && (me().role !== 'admin' || db().adminTestClock)); }
  function call(b) { var s = db().session || {}; b.appKey = S.PUNCH_APP_KEY; b.sessionToken = s.token; return A.api(b); }
  function load() {
    if (!allowed() || !A.endpointReady()) return; loaded = Date.now();
    call({ action: 'receipt_list' }).then(function (j) {
      if (j.ok) { items = j.items || []; if (j.jobs && j.jobs.length) jobs = j.jobs; myCards = j.my_cards || []; unsupported = false; }
      else if (/Unknown action/i.test(j.error || '')) unsupported = true;
      else if (j.authError) A.authLost();
      if (open) draw();
    }, function () { if (open) { status = 'Could not load receipts (no connection?). Your draft is safe.'; draw(); } });
  }
  function when(iso) { var ms = Date.parse(iso); return isNaN(ms) ? '' : new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT'; }
  function payBlock(f) {
    var html = '<label>How was it paid? (required)</label>' + R.PAYS.map(function (p) {
      return '<label style="font-size:1rem"><input type="radio" name="payhow" data-cf="payment_type" value="' + p.id + '" style="width:auto"' + (f.payment_type === p.id ? ' checked' : '') + '> ' + esc(p.label) + '</label>';
    }).join('');
    if (f.payment_type === 'company') {
      html += '<label>Which company card?</label><select data-cf="card_id"><option value="">Choose…</option>' +
        myCards.map(function (c) { return '<option value="' + esc(c.card_id) + '"' + (f.card_id === c.card_id ? ' selected' : '') + '>' + esc(R.cardLabel(c)) + '</option>'; }).join('') +
        '<option value="another"' + (f.card_id === 'another' ? ' selected' : '') + '>Another company card</option></select>' +
        '<label>Card last 4 (required — type or confirm)</label><input data-cf="card_last4" inputmode="numeric" maxlength="5" value="' + esc(f.card_last4 || '') + '" placeholder="1234">';
    } else if (f.payment_type === 'personal') {
      html += '<label>Paid with</label><select data-cf="paid_with"><option value="">Choose…</option>' + R.PAID.map(function (x) { return '<option' + (f.paid_with === x ? ' selected' : '') + '>' + esc(x) + '</option>'; }).join('') + '</select>' +
        '<label>Card last 4 (optional)</label><input data-cf="card_last4" inputmode="numeric" maxlength="5" value="' + esc(f.card_last4 || '') + '" placeholder="1234">';
    } else if (f.payment_type === 'unsure') {
      html += '<label>Card last 4 (optional)</label><input data-cf="card_last4" inputmode="numeric" maxlength="5" value="' + esc(f.card_last4 || '') + '" placeholder="1234">';
    }
    return html;
  }
  function draw() {
    if (!open) return; var f = draft(), t = testNow(), nFill = Object.keys(filled).length;
    modal.hidden = false;
    modal.innerHTML = '<div class="card" style="max-height:90vh;overflow:auto;width:min(100%,520px)"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Log a receipt</h2><button class="ghost sm" type="button" data-card="close" style="width:auto">Close</button></div>' +
      (unsupported ? '<p class="banner">Server update needed before receipts can be sent. Your draft stays on this phone.</p>' : '') +
      '<label>Charge date</label><input type="date" data-cf="charge_date" value="' + esc(f.charge_date || '') + '"' + (filled.charge_date ? ' style="background:#fff4c2"' : '') + '>' +
      '<label>Amount</label><input type="number" step="0.01" min="0.01" inputmode="decimal" data-cf="amount" value="' + esc(f.amount || '') + '" placeholder="0.00"' + (filled.amount ? ' style="background:#fff4c2"' : '') + '>' +
      '<label>Merchant</label><input data-cf="merchant" maxlength="120" value="' + esc(f.merchant || '') + '" placeholder="Store or vendor"' + (filled.merchant ? ' style="background:#fff4c2"' : '') + '>' +
      payBlock(f) +
      '<label>What it was for (required)</label><input data-cf="purpose" maxlength="500" value="' + esc(f.purpose || '') + '" placeholder="e.g. Office supplies">' +
      '<label>Job / property</label><select data-cf="job_property"><option value="">Choose…</option>' + jobs.map(function (j) { return '<option' + (f.job_property === j ? ' selected' : '') + '>' + esc(j) + '</option>'; }).join('') + '</select>' +
      '<label>Note' + (f.job_property === 'Other' ? ' (required for Other)' : ' (optional)') + '</label><textarea data-cf="note" rows="2" maxlength="1000">' + esc(f.note || '') + '</textarea>' +
      '<p class="muted">Receipt photo (required). You can add more than one. Photos are shrunk on this phone.</p>' +
      '<button class="ghost sm" type="button" data-card="photo">+ Add photo</button>' +
      (photos.length ? '<div class="row" style="flex-wrap:wrap">' + photos.map(function (p, i) { return '<span><img src="' + p.thumb + '" alt="receipt ' + (i + 1) + '" style="max-width:88px;max-height:110px;border-radius:8px"><button class="ghost sm" type="button" data-card="rmphoto" data-i="' + i + '" style="width:auto">Remove</button></span>'; }).join('') + '</div>' : '') +
      (ocrBusy ? '<p class="muted">Reading the receipt…</p>' : '') +
      (nFill ? '<p style="color:#7a5c12"><b>Auto-filled (yellow):</b> ' + Object.keys(filled).map(function (k) { return esc(k.replace('_', ' ')) + ' ' + esc(filled[k]); }).join(' · ') + '</p><label style="font-size:1rem"><input type="checkbox" data-card="reviewed" style="width:auto"' + (reviewed ? ' checked' : '') + '> I reviewed the yellow auto-filled fields</label>' : '') +
      (status ? '<p class="muted" role="status">' + esc(status) + '</p>' : '') +
      '<button class="go" type="button" data-card="send"' + (sending ? ' disabled' : '') + '>' + (sending ? 'Sending…' : (t ? 'Submit TEST receipt' : 'Submit receipt')) + '</button>' +
      '<h2 style="margin-top:1rem">My receipts</h2><button class="ghost sm" type="button" data-card="refresh" style="width:auto">Refresh</button>' +
      (items.length ? '<ul class="pl">' + items.map(function (x) {
        return '<li>' + (x.is_test ? '<span class="tag off">TEST</span> ' : '') + '<span class="tag ' + (x.status === 'reviewed' ? 'on' : x.status === 'flagged' ? 'off' : 'na') + '">' + esc(x.status) + '</span> <b>$' + esc(x.amount) + '</b> · ' + esc(x.merchant) +
          '<div class="muted">' + esc(x.charge_date) + ' · ' + esc(x.payment_type || '') + (x.reimbursement_status ? ' · ' + esc(x.reimbursement_status) : '') + ' · ' + esc(when(x.submitted_at_utc)) + '</div>' +
          '<div>' + esc(x.purpose) + '</div><small class="muted">Receipt ID ' + esc(x.receipt_id) + (x.card_last4 ? ' · ••' + esc(x.card_last4) : '') + '</small>' +
          ((x.photo_urls || []).length ? '<div>' + x.photo_urls.map(function (u, i) { return '<a href="' + esc(u) + '" target="_blank" rel="noopener">Photo ' + (i + 1) + '</a>'; }).join(' · ') + '</div>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="muted">' + (unsupported ? 'Available after the server update.' : 'No receipts submitted yet.') + '</p>') + '</div>';
  }
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t.closest('#cardModal') || !t.dataset.cf) return;
    var f = draft(); f[t.dataset.cf] = t.value;
    if (t.dataset.cf === 'card_last4') f.card_last4 = R.last4(t.value);
    if (t.dataset.cf === 'card_id') {
      var c = myCards.filter(function (x) { return x.card_id === f.card_id; })[0];
      if (c) f.card_last4 = R.last4(c.last4);
    }
    if (filled[t.dataset.cf] && String(t.value) !== String(filled[t.dataset.cf])) { delete filled[t.dataset.cf]; reviewed = false; }
    A.save(); if (/payment_type|card_id|job_property|paid_with/.test(t.dataset.cf)) draw();
  });
  picker.addEventListener('change', function () {
    var files = picker.files ? Array.prototype.slice.call(picker.files) : []; if (!files.length) return;
    status = 'Getting the photo ready…'; ocrBusy = true; draw();
    var chain = Promise.resolve(), added = [];
    files.forEach(function (file) {
      chain = chain.then(function () { return M.prepare(file).then(function (p) { added.push(p); photos.push({ blob: p.upload, thumb: p.thumb, canvas: p.ocrCanvas }); }); });
    });
    chain.then(function () {
      status = '';
      var c = added[0] && added[0].ocrCanvas;
      if (!c || !M.ocr) { ocrBusy = false; draw(); return; }
      return M.ocr(c).then(function (text) {
        ocrRaw = text || ''; ocrBusy = false;
        var got = R.parseReceipt(ocrRaw), f = draft(), n = 0;
        Object.keys(got).forEach(function (k) {
          if (!got[k]) return;
          if (!f[k] || filled[k] === String(f[k])) { f[k] = got[k]; filled[k] = got[k]; n++; }
        });
        reviewed = false; A.save();
        status = n ? 'Filled ' + n + ' field(s) from the photo. Check the yellow ones, then tick “I reviewed”.' : 'Could not read amount, date, or merchant confidently. Fill those by hand.';
        draw();
      }, function () { ocrBusy = false; status = 'Photo added. Could not read the text; fill the fields by hand.'; draw(); });
    }, function (e) { ocrBusy = false; status = (e && e.message) || 'Could not read that photo.'; draw(); });
  });
  function send() {
    if (sending) return; var f = draft(), err = R.validate({ charge_date: f.charge_date, amount: f.amount, merchant: f.merchant, payment_type: f.payment_type, paid_with: f.paid_with, card_last4: f.card_last4, purpose: f.purpose, job_property: f.job_property, note: f.note, photos: photos });
    if (err) { status = err; return draw(); }
    if (Object.keys(filled).length && !reviewed) { status = 'Check the yellow auto-filled fields, then tick “I reviewed”.'; return draw(); }
    sending = true; status = ''; draw();
    Promise.all(photos.map(function (p) { return M.b64(p.blob); })).then(function (b64s) {
      var body = R.payload(f, testNow()); body.action = 'receipt_add'; body.photos = b64s;
      return call(body);
    }).then(function (j) {
      sending = false;
      if (j.ok) {
        db().cardPref[me().email] = { payment_type: f.payment_type, card_id: f.card_id, card_last4: R.last4(f.card_last4), paid_with: f.paid_with }; db().cardDrafts[me().email] = blank(); A.save();
        photos = []; filled = {}; reviewed = false; ocrRaw = '';
        if (j.my_cards) myCards = j.my_cards;
        var id = (j.item && j.item.receipt_id) || '';
        status = 'Saved. Receipt ID ' + id + (j.item && j.item.is_test ? ' (TEST)' : '') + (j.card_note ? ' — ' + j.card_note : '');
        unsupported = false; if (j.jobs && j.jobs.length) jobs = j.jobs; draw(); load();
        A.flash('Receipt ' + id + ' saved' + (testNow() ? ' (TEST)' : '') + (j.card_note ? '. ' + j.card_note : '') + '.');
      } else {
        if (/Unknown action/i.test(j.error || '')) { unsupported = true; status = 'Server update needed. Your draft is safe on this phone.'; }
        else if (j.authError) { A.authLost(); status = 'Sign in again. Your draft is safe.'; }
        else status = j.error || 'Not sent. Please try again.';
        draw();
      }
    }, function () { sending = false; status = 'Not sent (no connection?). Your draft is safe. Try again.'; draw(); });
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-card]'); if (!b) return; var a = b.dataset.card;
    if (a === 'open') { if (!allowed()) return; open = true; status = ''; draw(); if (Date.now() - loaded > 30000) load(); }
    if (a === 'close') { open = false; modal.hidden = true; }
    if (a === 'photo') { picker.value = ''; picker.click(); }
    if (a === 'rmphoto') { photos.splice(+b.dataset.i, 1); draw(); }
    if (a === 'reviewed') { reviewed = b.checked; }
    if (a === 'send') send();
    if (a === 'refresh') load();
  });
  modal.addEventListener('click', function (ev) { if (ev.target === modal) { open = false; modal.hidden = true; } });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && open) { open = false; modal.hidden = true; } });
  function upd(sc) {
    var e = me().email || '', ok = (sc === 'app' || sc === 'admin') && allowed();
    if (owner !== e) { owner = e; items = []; myCards = []; photos = []; filled = {}; reviewed = false; loaded = 0; status = ''; unsupported = false; }
    document.querySelectorAll('[data-card="open"]').forEach(function (b) { b.hidden = !ok; });
    if (!ok) { open = false; modal.hidden = true; }
  }
  A.on('render', upd); upd(A.currentScreen());
})();
