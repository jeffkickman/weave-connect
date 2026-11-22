/* Weave Time — admin pure helpers (no DOM): stays grouping, CSV, Central time conversion, labels. Unit-tested in node. */
(function (root) {
  'use strict';
  var TZ = 'America/Chicago', STAY_RADIUS_M = 150;
  function hav(a, b) {
    var R = 6371000, toR = Math.PI / 180, dLa = (b.lat - a.lat) * toR, dLo = (b.lng - a.lng) * toR;
    var x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function ll(p) { var lat = parseFloat(p.latitude), lng = parseFloat(p.longitude); return isNaN(lat) || isNaN(lng) ? null : { lat: lat, lng: lng }; }
  // Consecutive points within STAY_RADIUS_M of the stay's first point form one stay. Points without coordinates are skipped.
  function groupStays(points, radius) {
    radius = radius || STAY_RADIUS_M; var stays = [], cur = null;
    points.forEach(function (p) {
      var here = ll(p); if (!here) return; var ms = Date.parse(p.timestamp_utc);
      if (cur && hav(cur.anchor, here) <= radius) { cur.points.push(p); cur.endMs = ms; if (!cur.desc && p.location_description) cur.desc = p.location_description; return; }
      cur = { anchor: here, startMs: ms, endMs: ms, points: [p], desc: p.location_description || '', onsite: p.onsite_status }; stays.push(cur);
    });
    return stays.map(function (s, i) {
      var until = stays[i + 1] ? stays[i + 1].startMs : s.endMs;   // a stay lasts until the first point somewhere else
      return { lat: s.anchor.lat, lng: s.anchor.lng, start_utc: new Date(s.startMs).toISOString(), end_utc: new Date(until).toISOString(),
        minutes: Math.round((until - s.startMs) / 60000), count: s.points.length,
        location_description: s.desc, onsite_status: s.onsite, maps_link: 'https://www.google.com/maps?q=' + s.anchor.lat + ',' + s.anchor.lng };
    });
  }
  function routeLink(points) {   // Google Maps directions through up to 10 sampled points
    var pts = points.map(ll).filter(Boolean); if (pts.length < 2) return '';
    var n = Math.min(10, pts.length), out = [];
    for (var i = 0; i < n; i++) out.push(pts[Math.round(i * (pts.length - 1) / (n - 1))]);
    return 'https://www.google.com/maps/dir/' + out.map(function (p) { return p.lat + ',' + p.lng; }).join('/');
  }
  // ---- Central time <-> UTC for the edit forms (datetime-local values are Central wall-clock) ----
  function parts(ms) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    var o = {}; f.formatToParts(new Date(ms)).forEach(function (x) { o[x.type] = x.value; }); return o;
  }
  function utcToCtInput(iso) { var ms = Date.parse(iso); if (isNaN(ms)) return ''; var p = parts(ms); return p.year + '-' + p.month + '-' + p.day + 'T' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute; }
  function ctInputToUtc(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); if (!m) return '';
    var want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]), guess = want;
    for (var i = 0; i < 3; i++) { var p = parts(guess), got = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute); guess += want - got; }
    return new Date(guess).toISOString();
  }
  function ctLabel(iso) { var ms = Date.parse(iso); return isNaN(ms) ? '' : new Date(ms).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function ctTime(iso) { var ms = Date.parse(iso); return isNaN(ms) ? '' : new Date(ms).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); }
  function ageLabel(sec) { sec = Math.max(0, +sec || 0); if (sec < 90) return 'just now'; if (sec < 3600) return Math.round(sec / 60) + ' min ago'; if (sec < 86400) return (sec / 3600).toFixed(1) + ' h ago'; return Math.round(sec / 86400) + ' d ago'; }
  function minutesLabel(min) { min = Math.round(min); return min < 60 ? min + ' min' : Math.floor(min / 60) + 'h ' + (min % 60 < 10 ? '0' : '') + (min % 60) + 'm'; }
  // ---- CSV (payroll) ----
  function cell(v) { var s = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function csv(rows) { return rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n') + '\r\n'; }
  function weekCsv(rep) {
    var dates = (rep.employees[0] && rep.employees[0].days.map(function (d) { return d.date; })) || [];
    var rows = [['Weave Time weekly hours', rep.week_start_sun + ' to ' + rep.week_end_sat, 'Central time', 'Lunch unpaid; breaks paid']],
      head = ['Employee', 'Employee ID', 'Email'].concat(dates, ['Net hours', 'Lunch min', 'Break min', 'Punches', 'Offsite punches', 'Edited punches', 'Shift open', 'Issues']);
    rows.push(head);
    rep.employees.forEach(function (e) {
      rows.push([e.full_name, e.employee_id, e.email].concat(e.days.map(function (d) { return d.netHours.toFixed(2); }),
        [e.netHours.toFixed(2), e.lunchMinutes, e.breakMinutes, e.punchCount, e.offsite.length, e.edited.length, e.shiftOpen ? 'YES' : '', (e.issues || []).join('; ')]));
    });
    rows.push([]); rows.push(['GUEST punches (not matched to an account)']); rows.push(['Guest name', 'Punch', 'Central time', 'Onsite', 'Guest note', 'Note', 'Place']);
    (rep.guests || []).forEach(function (g) { rows.push([g.employee_name, g.punch_type, g.local_time_ct, g.onsite_status, g.guest_note, g.note, g.location_description]); });
    return csv(rows);
  }
  function punchesCsv(ps) {
    var cols = ['punch_id', 'record_type', 'employee_name', 'employee_id', 'employee_email', 'punch_type', 'local_time_ct', 'timestamp_utc', 'week_start_sun', 'onsite_status', 'distance_m', 'location_description', 'latitude', 'longitude', 'note', 'guest_note', 'source', 'status', 'edited_by', 'edited_at_utc', 'edit_reason', 'session_id', 'is_test'];
    return csv([cols].concat(ps.map(function (p) { return cols.map(function (c) { return p[c]; }); })));
  }
  function stateCounts(people) { var c = { on: 0, lunch: 0, 'break': 0, off: 0 }; people.forEach(function (p) { c[p.state] = (c[p.state] || 0) + 1; }); return c; }
  function addDays(key, n) { var a = key.split('-').map(Number), d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n)); return d.toISOString().slice(0, 10); }
  var api = { groupStays: groupStays, routeLink: routeLink, utcToCtInput: utcToCtInput, ctInputToUtc: ctInputToUtc, ctLabel: ctLabel, ctTime: ctTime,
    ageLabel: ageLabel, minutesLabel: minutesLabel, weekCsv: weekCsv, punchesCsv: punchesCsv, csv: csv, stateCounts: stateCounts, addDays: addDays, hav: hav, STAY_RADIUS_M: STAY_RADIUS_M };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTA = api;
})(typeof window !== 'undefined' ? window : this);
