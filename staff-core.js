/* Weave Time — core logic (pure functions, no DOM). Used by staff.html and by tests (node). */
(function (root) {
  'use strict';

  // ===== CONFIG =====
  var CONFIG = {
    TIMEZONE: 'America/Chicago',
    LUNCH_PAID: false,          // lunch time is UNPAID: subtracted from worked hours
    BREAK_PAID: true,           // short breaks are PAID: counted in hours, minutes shown separately
    // Office: 1510 E Three Notch St, Andalusia, AL 36420.
    // Source: OpenStreetMap Nominatim (way 107914564) 31.3154099, -86.4638976, looked up 2026-11-17;
    // cross-checked with US Census geocoder (31.315414, -86.463934), ~3 m apart.
    OFFICE: { lat: 31.3154099, lng: -86.4638976, label: '1510 E Three Notch St, Andalusia, AL' },
    ONSITE_RADIUS_M: 250,       // within this distance of the office = onsite
    NOTE_MIN_CHARS: 10,         // offsite / no-location punches need a note this long
    GEO_TIMEOUT_MS: 15000
  };

  var TYPES = {
    clock_in: 'Clock In', clock_out: 'Clock Out',
    lunch_start: 'Lunch Start', lunch_end: 'Lunch End',
    break_start: 'Break Start', break_end: 'Break End'
  };
  // state -> allowed next punch types (first = primary)
  var NEXT = {
    off: ['clock_in'],
    on: ['clock_out', 'lunch_start', 'break_start'],
    lunch: ['lunch_end'],
    'break': ['break_end']
  };
  var AFTER = { clock_in: 'on', clock_out: 'off', lunch_start: 'lunch', lunch_end: 'on', break_start: 'break', break_end: 'on' };

  function sortPunches(p) { return p.slice().sort(function (a, b) { return Date.parse(a.ts) - Date.parse(b.ts); }); }
  function stateOf(punches) {
    var s = sortPunches(punches), st = 'off';
    for (var i = 0; i < s.length; i++) if (AFTER[s[i].type]) st = AFTER[s[i].type];
    return st;
  }
  function allowed(punches) { return NEXT[stateOf(punches)].slice(); }
  function canPunch(punches, type) { return allowed(punches).indexOf(type) !== -1; }

  // ===== geo =====
  function haversineM(a, b) {
    var R = 6371008.8, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // loc = {lat,lng,acc} or null (unavailable/denied)
  function assessLocation(loc) {
    if (!loc || typeof loc.lat !== 'number') return { dist: null, onsite: false, needsNote: true };
    var d = Math.round(haversineM(CONFIG.OFFICE, loc));
    var on = d <= CONFIG.ONSITE_RADIUS_M;
    return { dist: d, onsite: on, needsNote: !on };
  }
  function noteOk(note) { return (note || '').trim().length >= CONFIG.NOTE_MIN_CHARS; }

  // ===== time zone helpers =====
  var dtfCache = {};
  function dtf(tz) {
    return dtfCache[tz] || (dtfCache[tz] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  }
  function parts(ms, tz) {
    var o = {};
    dtf(tz || CONFIG.TIMEZONE).formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(ms, tz) { var p = parts(ms, tz); return p.y + '-' + pad(p.m) + '-' + pad(p.d); }
  function offsetMs(ms, tz) { var p = parts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000; }
  // epoch ms of local midnight that starts dateKey
  function midnight(key, tz) {
    var a = key.split('-').map(Number), guess = Date.UTC(a[0], a[1] - 1, a[2]);
    var t = guess - offsetMs(guess, tz);
    return guess - offsetMs(t, tz);
  }
  function addDays(key, n) {
    var a = key.split('-').map(Number), d = new Date(Date.UTC(a[0], a[1] - 1, a[2] + n));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function dow(key) { var a = key.split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])).getUTCDay(); }
  function weekStart(ms, tz) { var k = dateKey(ms, tz); return addDays(k, -dow(k)); } // Sunday
  function localTime(ms, tz) {
    return new Date(ms).toLocaleString('en-US', { timeZone: tz || CONFIG.TIMEZONE, weekday: 'short', month: 'short',
      day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  }

  // ===== hours =====
  // Build intervals {kind:'work'|'lunch'|'break', s, e}; 'work' = on shift excluding lunch AND break.
  function intervals(punches, nowMs) {
    var s = sortPunches(punches), out = [], st = 'off', since = null, issues = [];
    function close(t) { if (since !== null && t > since && st !== 'off') out.push({ kind: st === 'on' ? 'work' : st, s: since, e: t }); }
    for (var i = 0; i < s.length; i++) {
      var p = s[i], t = Date.parse(p.ts);
      if (NEXT[st].indexOf(p.type) === -1) { issues.push('Out-of-order ' + TYPES[p.type] + ' at ' + p.ts); }
      close(t);
      st = AFTER[p.type] || st; since = t;
    }
    var open = st !== 'off';
    if (open && nowMs) close(nowMs);
    return { list: out, open: open, state: st, issues: issues };
  }
  // Split intervals at local midnight and total per day. Returns {days:{key:{workMin,lunchMin,breakMin,paidMin}}, open, issues}
  function dailyTotals(punches, nowMs, tz) {
    tz = tz || CONFIG.TIMEZONE;
    var iv = intervals(punches, nowMs), days = {};
    iv.list.forEach(function (x) {
      var a = x.s;
      while (a < x.e) {
        var k = dateKey(a, tz), next = midnight(addDays(k, 1), tz), b = Math.min(x.e, next);
        var d = days[k] || (days[k] = { workMin: 0, lunchMin: 0, breakMin: 0, paidMin: 0 });
        var m = (b - a) / 60000;
        d[x.kind + 'Min'] += m;
        if (x.kind === 'work' || (x.kind === 'break' && CONFIG.BREAK_PAID) || (x.kind === 'lunch' && CONFIG.LUNCH_PAID)) d.paidMin += m;
        a = b;
      }
    });
    return { days: days, open: iv.open, issues: iv.issues };
  }
  function r2(x) { return Math.round(x * 100) / 100; }
  function weekSummary(punches, wkStart, nowMs, tz, profile) {
    tz = tz || CONFIG.TIMEZONE;
    var dt = dailyTotals(punches, nowMs, tz), days = [], tot = { paid: 0, lunch: 0, brk: 0 };
    var wkEnd = addDays(wkStart, 6);
    var wp = sortPunches(punches).filter(function (p) { var k = dateKey(Date.parse(p.ts), tz); return k >= wkStart && k <= wkEnd; });
    for (var i = 0; i < 7; i++) {
      var k = addDays(wkStart, i), d = dt.days[k] || { paidMin: 0, lunchMin: 0, breakMin: 0 };
      tot.paid += d.paidMin; tot.lunch += d.lunchMin; tot.brk += d.breakMin;
      days.push({ date: k, netHours: r2(d.paidMin / 60), lunchMinutes: Math.round(d.lunchMin), breakMinutes: Math.round(d.breakMin),
        punchCount: wp.filter(function (p) { return dateKey(Date.parse(p.ts), tz) === k; }).length });
    }
    return {
      format: 'weave-time-weekly/v1', generatedAt: new Date(nowMs || Date.now()).toISOString(), timezone: tz,
      source: 'device-local (phone localStorage) — not server-verified',
      employee: { name: (profile && profile.name) || '', employeeId: (profile && profile.empId) || '' },
      weekStart: wkStart, weekEnd: wkEnd,
      policy: { lunchPaid: CONFIG.LUNCH_PAID, breakPaid: CONFIG.BREAK_PAID, onsiteRadiusM: CONFIG.ONSITE_RADIUS_M, office: CONFIG.OFFICE },
      totals: { netHours: r2(tot.paid / 60), lunchMinutes: Math.round(tot.lunch), breakMinutes: Math.round(tot.brk),
        punchCount: wp.length, offsitePunches: wp.filter(function (p) { return !p.onsite; }).length,
        shiftOpen: dt.open && nowMs ? true : false },
      days: days,
      punches: wp.map(function (p) {
        return { type: p.type, label: TYPES[p.type], ts: p.ts, local: p.local, lat: p.lat, lng: p.lng, accuracyM: p.acc,
          distanceM: p.dist, onsite: !!p.onsite, locationStatus: p.locStatus || '', note: p.note || '' };
      }),
      issues: dt.issues
    };
  }
  function csvCell(v) { v = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(sum) {
    var H = ['record', 'employee', 'employee_id', 'week_start', 'date', 'type', 'local_time', 'iso_time', 'net_hours', 'lunch_min', 'break_min',
      'onsite', 'distance_m', 'lat', 'lng', 'accuracy_m', 'location_status', 'note'];
    var e = sum.employee, rows = [H];
    rows.push(['week', e.name, e.employeeId, sum.weekStart, sum.weekStart + '..' + sum.weekEnd, '', '', '', sum.totals.netHours, sum.totals.lunchMinutes, sum.totals.breakMinutes, '', '', '', '', '', '', sum.totals.shiftOpen ? 'shift still open' : '']);
    sum.days.forEach(function (d) { rows.push(['day', e.name, e.employeeId, sum.weekStart, d.date, '', '', '', d.netHours, d.lunchMinutes, d.breakMinutes, '', '', '', '', '', '', '']); });
    sum.punches.forEach(function (p) {
      rows.push(['punch', e.name, e.employeeId, sum.weekStart, p.ts ? dateKey(Date.parse(p.ts), sum.timezone) : '', p.type, p.local, p.ts, '', '', '',
        p.onsite ? 'yes' : 'no', p.distanceM, p.lat, p.lng, p.accuracyM, p.locationStatus, p.note]);
    });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function toText(sum) {
    var L = ['Weave Time — weekly hours', sum.employee.name + (sum.employee.employeeId ? ' (ID ' + sum.employee.employeeId + ')' : ''),
      'Week ' + sum.weekStart + ' to ' + sum.weekEnd + ' (Sun–Sat, Central)',
      'Net paid hours: ' + sum.totals.netHours.toFixed(2) + '  | Lunch (unpaid): ' + sum.totals.lunchMinutes + ' min  | Breaks (paid): ' + sum.totals.breakMinutes + ' min',
      'Offsite punches: ' + sum.totals.offsitePunches + (sum.totals.shiftOpen ? '  | SHIFT STILL OPEN' : ''), ''];
    sum.days.forEach(function (d) { if (d.punchCount || d.netHours) L.push(d.date + ': ' + d.netHours.toFixed(2) + ' h (lunch ' + d.lunchMinutes + 'm, break ' + d.breakMinutes + 'm)'); });
    L.push('');
    sum.punches.forEach(function (p) { L.push(p.local + ' — ' + p.label + ' — ' + (p.onsite ? 'onsite' : 'OFFSITE') + (p.distanceM !== null && p.distanceM !== undefined ? ' (' + p.distanceM + ' m)' : ' (no location)') + (p.note ? ' — "' + p.note + '"' : '')); });
    L.push('', 'Data recorded on this phone (format weave-time-weekly/v1).');
    return L.join('\n');
  }

  var api = { CONFIG: CONFIG, TYPES: TYPES, stateOf: stateOf, allowed: allowed, canPunch: canPunch, haversineM: haversineM,
    assessLocation: assessLocation, noteOk: noteOk, dateKey: dateKey, weekStart: weekStart, addDays: addDays, midnight: midnight,
    localTime: localTime, intervals: intervals, dailyTotals: dailyTotals, weekSummary: weekSummary, toCSV: toCSV, toText: toText, sortPunches: sortPunches };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WT = api;
})(this);
