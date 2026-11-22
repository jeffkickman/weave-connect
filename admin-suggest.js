/* Weave Time v7 — admin Suggestions tab: staff ideas with filters, screenshot link, status + internal note (not shown to staff). */
(function () {
  'use strict';
  var A = window.WTApp, W = window.WTAdmin; if (!A || !W) return;
  var esc = A.esc, st = W.st, sg = st.sug = { status: 'new', category: '', list: null, counts: {}, loading: false, err: '' };
  var STAT = ['new', 'reviewing', 'planned', 'done', 'declined'], CATS = ['Clock', 'Driver/route', 'Photos & auto-fill', 'Hours/history', 'Other'];
  function load() {
    sg.loading = true; sg.err = '';
    W.call('admin_suggestions', { status: sg.status, category: sg.category }).then(function (j) { sg.loading = false; sg.list = j.items || []; sg.counts = j.counts || {}; if (st.tab === 'suggestions') W.draw(); },
      function (e) { sg.loading = false; sg.list = []; sg.err = e.message; if (st.tab === 'suggestions') W.draw(); });
  }
  function when(iso) { var ms = Date.parse(iso); return isNaN(ms) ? '' : new Date(ms).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT'; }
  function card(x) {
    return '<div class="ad-card"><div class="ad-row"><b class="ad-grow">' + esc(x.name || x.email) + ' <span class="muted">' + esc(x.roles) + '</span></b><span class="pill">' + esc(x.category) + '</span>' +
      '<span class="pill ' + (x.status === 'new' ? 'p-lunch' : x.status === 'done' ? 'p-on' : x.status === 'declined' ? 'p-bad' : 'p-off') + '">' + esc(x.status) + '</span></div>' +
      '<div class="muted">' + esc(when(x.created_utc)) + ' · ' + esc(x.email) + '</div><div style="white-space:pre-wrap;margin:.3rem 0">' + esc(x.text) + '</div>' +
      (x.screenshot_url ? '<a class="btn-s" target="_blank" rel="noopener" href="' + esc(x.screenshot_url) + '">Screenshot</a>' : x.screenshot_error ? '<span class="muted">Screenshot not saved: ' + esc(x.screenshot_error) + '</span>' : '') +
      '<form class="ad-row" data-sgform="' + esc(x.id) + '" style="margin-top:.35rem"><select name="status" style="width:auto">' + STAT.map(function (s) { return '<option' + (s === x.status ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select>' +
      '<input name="note" class="ad-grow" maxlength="1000" placeholder="Internal note (staff don’t see it)" value="' + esc(x.admin_note) + '"><button class="ghost btn-s" type="submit">Save</button></form>' +
      (x.updated_by ? '<div class="muted">Updated by ' + esc(x.updated_by) + ' · ' + esc(when(x.updated_utc)) + '</div>' : '') + '</div>';
  }
  W.views.suggestions = function () {
    if (!sg.list && !sg.loading) setTimeout(load, 0);
    var c = sg.counts || {};
    return '<div class="ad-row"><select id="sgStatus" style="width:auto"><option value="">All statuses</option>' + STAT.map(function (s) { return '<option value="' + s + '"' + (s === sg.status ? ' selected' : '') + '>' + s + (c[s] ? ' (' + c[s] + ')' : '') + '</option>'; }).join('') + '</select>' +
      '<select id="sgCat" style="width:auto"><option value="">All categories</option>' + CATS.map(function (s) { return '<option' + (s === sg.category ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
      '<button class="ghost btn-s" type="button" id="sgReload">Refresh</button></div>' +
      '<p class="muted">Ideas from staff (“Suggest an idea” in the app). Sender and roles come from their sign-in. Staff see the status, not your note.</p>' +
      (sg.err ? '<p class="err">' + esc(sg.err) + '</p>' : '') + (sg.loading && !sg.list ? '<p class="muted">Loading…</p>' : '') +
      ((sg.list || []).map(card).join('') || (sg.list && !sg.err ? '<p class="muted">No suggestions' + (sg.status ? ' with status “' + esc(sg.status) + '”' : '') + '.</p>' : ''));
  };
  document.addEventListener('change', function (ev) {
    if (A.currentScreen() !== 'admin' || st.tab !== 'suggestions') return; var t = ev.target;
    if (t.id === 'sgStatus') { sg.status = t.value; sg.list = null; load(); }
    if (t.id === 'sgCat') { sg.category = t.value; sg.list = null; load(); }
  });
  document.addEventListener('click', function (ev) { if (A.currentScreen() === 'admin' && st.tab === 'suggestions' && ev.target.id === 'sgReload') load(); });
  document.addEventListener('submit', function (ev) {
    var f = ev.target; if (!f.dataset || !f.dataset.sgform) return; ev.preventDefault();
    W.call('admin_suggestion_set', { id: f.dataset.sgform, status: f.elements.status.value, note: f.elements.note.value.trim() }).then(function () { A.flash('Saved.'); load(); }, W.fail);
  });
})();
