/* Weave Time — driver route logic (pure, no DOM): fields, validation, miles, count checks, payloads. Tests: tools/test-driver-core.js.
   Field set comes from what drivers already post in Chat at route start / finish (notebook photo + Flex screenshot). */
(function (root) {
  'use strict';
  var ROUTES = ['Route 1', '3 Notch', 'Route 9'], VEHICLES = ['New Van', 'Old Van', 'Old T', 'Personal car'];
  function blank(v) { return v === undefined || v === null || String(v).trim() === ''; }
  function whole(v) { if (blank(v)) return ''; var s = String(v).trim(); return /^\d{1,5}$/.test(s) ? +s : NaN; }
  function odo(v) { if (blank(v)) return NaN; var s = String(v).trim().replace(/,/g, ''); return /^\d{1,7}(\.\d)?$/.test(s) ? +s : NaN; }
  function totes(list) {
    return (list || []).map(function (t) { return { label: String(t.label || '').trim().slice(0, 40), packages: whole(t.packages) }; })
      .filter(function (t) { return t.label || t.packages !== ''; });
  }
  function sum(a) { return a.reduce(function (x, y) { return x + (typeof y === 'number' && !isNaN(y) ? y : 0); }, 0); }
  function pick(sel, other) { return sel === 'Other' ? String(other || '').trim() : String(sel || '').trim(); }

  // f = start draft: { route, routeOther, vehicle, vehicleOther, start_odometer, start_packages, totes:[{label,packages}], oversize_count, overflow_count, start_stops, start_note, mode:'real'|'test' }
  function validateStart(f, allowTest, preview) {
    var e = [], tt = totes(f.totes);
    if (!pick(f.route, f.routeOther)) e.push('Choose the route.');
    if (!pick(f.vehicle, f.vehicleOther)) e.push('Choose the vehicle.');
    if (isNaN(odo(f.start_odometer))) e.push('Enter the starting mileage (odometer, e.g. 74029.1).');
    var p = whole(f.start_packages); if (p === '' || isNaN(p)) e.push('Enter the total package count.');
    if ([f.oversize_count, f.overflow_count, f.start_stops].some(function (v) { return isNaN(whole(v)); })) e.push('Oversize, overflow and stops must be whole numbers.');
    if (tt.some(function (t) { return isNaN(t.packages); })) e.push('Tote counts must be whole numbers.');
    if (allowTest && !preview && f.mode !== 'real' && f.mode !== 'test') e.push('Choose Real route or Test.');
    return e;
  }
  function startWarnings(f) {
    var p = whole(f.start_packages), tt = totes(f.totes), w = [];
    if (tt.length && typeof p === 'number' && !isNaN(p)) {
      var t = sum(tt.map(function (x) { return x.packages; })) + sum([whole(f.oversize_count), whole(f.overflow_count)]);
      if (t !== p) w.push('Totes + oversize + overflow = ' + t + ', but total packages = ' + p + '. Double-check (saving is still allowed).');
    }
    return w;
  }
  // g = finish draft; start = the started route's numbers { start_odometer, start_packages }
  function validateFinish(g, start) {
    var e = [], eo = odo(g.end_odometer), d = whole(g.delivered_packages), r = whole(g.returned_packages), m = whole(g.missing_packages), dm = whole(g.damaged_packages);
    if (isNaN(eo)) e.push('Enter the ending mileage (odometer).'); else if (eo < +start.start_odometer) e.push('Ending mileage is lower than starting mileage (' + start.start_odometer + ').');
    if (d === '' || isNaN(d)) e.push('Enter packages delivered.');
    if (r === '' || isNaN(r)) e.push('Enter packages returned / undelivered (0 if none).');
    if ([m, dm, whole(g.successful_stops), whole(g.unsuccessful_stops)].some(function (x) { return isNaN(x); })) e.push('Counts must be whole numbers.');
    if (r > 0 && String(g.returned_reasons || '').trim().length < 3) e.push('Say why packages came back.');
    if ((m > 0 || dm > 0) && String(g.end_note || '').trim().length < 3) e.push('Add a note about the missing / damaged packages.');
    return e;
  }
  function miles(a, b) { var x = odo(a), y = odo(b); return isNaN(x) || isNaN(y) || y < x ? null : Math.round((y - x) * 10) / 10; }
  function finishCheck(g, start) {
    var d = whole(g.delivered_packages), r = whole(g.returned_packages), m = whole(g.missing_packages), s = +start.start_packages;
    if (typeof d !== 'number' || typeof r !== 'number' || isNaN(d) || isNaN(r)) return null;
    var acc = d + r + (typeof m === 'number' && !isNaN(m) ? m : 0);
    return { accounted: acc, started: s, diff: acc - s, ok: acc === s, text: d + ' delivered + ' + r + ' returned + ' + (m || 0) + ' missing = ' + acc + ' of ' + s + ' started' + (acc === s ? ' — OK' : ' — difference ' + (acc - s)) };
  }
  function startPayload(f, allowTest, preview) {
    return { route_name: pick(f.route, f.routeOther), vehicle: pick(f.vehicle, f.vehicleOther), start_odometer: String(odo(f.start_odometer)), start_packages: whole(f.start_packages),
      totes: totes(f.totes), oversize_count: whole(f.oversize_count), overflow_count: whole(f.overflow_count), start_stops: whole(f.start_stops),
      start_note: String(f.start_note || '').trim().slice(0, 500), is_test: preview ? true : allowTest ? f.mode === 'test' : false };
  }
  function finishPayload(g) {
    return { end_odometer: String(odo(g.end_odometer)), delivered_packages: whole(g.delivered_packages), returned_packages: whole(g.returned_packages),
      returned_reasons: String(g.returned_reasons || '').trim().slice(0, 500), missing_packages: whole(g.missing_packages), damaged_packages: whole(g.damaged_packages),
      successful_stops: whole(g.successful_stops), unsuccessful_stops: whole(g.unsuccessful_stops), end_note: String(g.end_note || '').trim().slice(0, 800) };
  }
  function newRouteId(c) { var r = ''; if (c && c.getRandomValues) { var a = new Uint8Array(8); c.getRandomValues(a); for (var i = 0; i < 8; i++) r += ('0' + a[i].toString(16)).slice(-2); } else r = Math.random().toString(16).slice(2, 18); return 'cr-' + Date.now().toString(36) + '-' + r; }
  function postLabel(s) { return { pending: 'Waiting for Atlas to post', posted: 'Posted to Chat', test: 'TEST — not posted' }[s] || ''; }
  function routesCsv(list) {
    var cols = ['date_ct', 'is_test', 'employee_name', 'employee_email', 'route_name', 'vehicle', 'started_local_ct', 'start_odometer', 'start_packages', 'totes_text', 'oversize_count', 'overflow_count', 'start_stops',
      'finished_local_ct', 'end_odometer', 'miles', 'delivered_packages', 'returned_packages', 'returned_reasons', 'missing_packages', 'damaged_packages', 'successful_stops', 'unsuccessful_stops', 'start_note', 'end_note',
      'status', 'start_post_status', 'end_post_status', 'edited_by', 'edit_reason', 'route_id'];
    var q = function (v) { v = v === true ? 'TEST' : v === false ? '' : String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return [cols].concat(list.map(function (r) { return cols.map(function (c) { return r[c]; }); })).map(function (row) { return row.map(q).join(','); }).join('\n') + '\n';
  }
  var api = { ROUTES: ROUTES, VEHICLES: VEHICLES, whole: whole, odo: odo, totes: totes, validateStart: validateStart, startWarnings: startWarnings, validateFinish: validateFinish,
    miles: miles, finishCheck: finishCheck, startPayload: startPayload, finishPayload: finishPayload, newRouteId: newRouteId, postLabel: postLabel, routesCsv: routesCsv };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTD = api;
})(typeof window !== 'undefined' ? window : this);
