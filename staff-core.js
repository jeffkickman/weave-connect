/* Weave Time — core logic (pure functions, no DOM). Used by staff.html and by tests (node: tools/test-staff-core.js). */
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
  function weekSummary(punches, wkStart, nowMs, tz) {
    tz = tz || CONFIG.TIMEZONE;
    var dt = dailyTotals(punches, nowMs, tz), days = [], tot = { paid: 0, lunch: 0, brk: 0 };
    var wkEnd = addDays(wkStart, 6);
    var wp = sortPunches(punches).filter(function (p) { var k = dateKey(Date.parse(p.ts), tz); return k >= wkStart && k <= wkEnd; });
    for (var i = 0; i < 7; i++) {
      var k = addDays(wkStart, i), d = dt.days[k] || { paidMin: 0, lunchMin: 0, breakMin: 0 };
      tot.paid += d.paidMin; tot.lunch += d.lunchMin; tot.brk += d.breakMin;
      days.push({ date: k, netHours: r2(d.paidMin / 60), lunchMinutes: Math.round(d.lunchMin), breakMinutes: Math.round(d.breakMin),
        punches: wp.filter(function (p) { return dateKey(Date.parse(p.ts), tz) === k; }) });
    }
    return { weekStart: wkStart, weekEnd: wkEnd, days: days, punches: wp, issues: dt.issues,
      totals: { netHours: r2(tot.paid / 60), lunchMinutes: Math.round(tot.lunch), breakMinutes: Math.round(tot.brk),
        punchCount: wp.length, offsitePunches: wp.filter(function (p) { return onsiteStatus(p) === 'offsite'; }).length,
        shiftOpen: !!(dt.open && nowMs) } };
  }

  // ===== central sync (Google Apps Script "Weave Time Punches": Punches + Employees tabs) =====
  function newPunchId(cryptoObj) {
    if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
    var b = [];
    for (var i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256));
    if (cryptoObj && cryptoObj.getRandomValues) { var u = new Uint8Array(16); cryptoObj.getRandomValues(u); b = Array.prototype.slice.call(u); }
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function onsiteStatus(p) {
    if (p.onsite_status === 'onsite' || p.onsite_status === 'offsite' || p.onsite_status === 'unknown') return p.onsite_status;
    if (p.lat === null || p.lat === undefined || p.locStatus !== 'ok') return 'unknown';
    return p.onsite ? 'onsite' : 'offsite';
  }
  // Employee-facing label: never includes coordinates, distance or address.
  function locationLabel(p) { var s = onsiteStatus(p); return s === 'onsite' ? 'Onsite' : s === 'offsite' ? 'Offsite' : 'Location unavailable'; }
  function nz(v) { return v === null || v === undefined ? '' : v; }
  function punchFields(p) {
    var ms = Date.parse(p.ts);
    return { punch_id: p.punch_id, punch_type: p.type, timestamp_utc: new Date(ms).toISOString(), local_time_ct: localTime(ms),
      week_start_sun: weekStart(ms), onsite_status: onsiteStatus(p), distance_m: nz(p.dist), location_description: p.locDesc || '',
      latitude: nz(p.lat), longitude: nz(p.lng), accuracy_m: nz(p.acc), location_status: p.locStatus || '', note: p.note || '' };
  }
  function assign(o, x) { for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = x[k]; return o; }
  function buildPayload(p, appKey, sessionToken) {
    var b = assign(assign({ action: 'punch', appKey: appKey, sessionToken: sessionToken || '' }, punchFields(p)), { source: 'weave-time-web' });
    if (p.isTest) b.is_test = true;
    return b;
  }
  function buildGuestPayload(p, appKey) {
    return assign(assign({ action: 'guest_punch', appKey: appKey, guest_name: p.guestName || '', guest_note: p.guestNote || '' }, punchFields(p)),
      { source: 'weave-time-guest' });
  }
  function guestOk(name, note) { return (name || '').trim().length >= 2 && (note || '').trim().length >= 4; }
  function passwordProblem(pw, confirm) {
    if ((pw || '').length < 8) return 'Password must be at least 8 characters.';
    if (pw !== confirm) return 'The two new passwords do not match.';
    return '';
  }
  // Sheets may hand back ISO text or a Date-ish string; normalise to ISO (or '' if unparseable).
  function normalizeTs(v) {
    var ms = Date.parse(v);
    if (isNaN(ms)) ms = Date.parse(String(v || '').replace(/\s*\(.*\)\s*$/, ''));
    return isNaN(ms) ? '' : new Date(ms).toISOString();
  }
  function fromServer(sp, email) {
    var ts = normalizeTs(sp.ts);
    return { punch_id: String(sp.punch_id || ''), type: sp.type, ts: ts, local: sp.local_time_ct || (ts ? localTime(Date.parse(ts)) : ''),
      onsite_status: sp.onsite_status || 'unknown', locStatus: sp.location_status || '', note: sp.note || '', status: sp.status || 'active',
      syncStatus: 'synced', ownerEmail: email, isTest: sp.is_test === true || undefined };
  }
  // Server is the source of truth for this employee's synced punches (Jeff's Sheet edits win).
  // Local punches still pending upload are kept unless the server already has that punch_id. Void punches are dropped.
  function mergeServerPunches(local, serverList, email) {
    var byId = {}, out = [];
    (serverList || []).forEach(function (sp) {
      if (String(sp.status || '').toLowerCase() === 'void' || !TYPES[sp.type]) return;
      var p = fromServer(sp, email); if (!p.punch_id || !p.ts) return;
      byId[p.punch_id] = true; out.push(p);
    });
    (local || []).forEach(function (p) {
      if (p.ownerEmail !== email) { out.push(p); return; }               // another account's queue on this phone: untouched
      if (p.syncStatus !== 'synced' && !byId[p.punch_id]) out.push(p);    // still waiting to upload
    });
    return out;
  }
  function forOwner(punches, email) { return punches.filter(function (p) { return p.ownerEmail === email && p.status !== 'void'; }); }
  function pendingPunches(punches, email) {
    return sortPunches(punches).filter(function (p) { return p.syncStatus !== 'synced' && (email === undefined || p.ownerEmail === email); });
  }
  function markSynced(punches, id, atIso) {
    for (var i = 0; i < punches.length; i++) if (punches[i].punch_id === id) { punches[i].syncStatus = 'synced'; punches[i].syncedAt = atIso; return true; }
    return false;
  }
  function syncLabel(n, endpointReady, authNeeded) {
    if (!n) return 'All punches saved';
    var t = n + ' punch' + (n === 1 ? '' : 'es') + ' waiting to sync';
    if (authNeeded) return t + ' — sign in again to send';
    return t + (endpointReady ? '' : ' (saved on this phone)');
  }
  // Short human-readable place from BigDataCloud reverse-geocode-client JSON (city, state ZIP). Never shown to employees.
  function placeFromBDC(j) {
    if (!j) return '';
    var city = j.city || j.locality || '', st = j.principalSubdivisionCode ? String(j.principalSubdivisionCode).replace(/^US-/, '') : (j.principalSubdivision || '');
    return [city, [st, j.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ').slice(0, 200);
  }

  var api = { CONFIG: CONFIG, TYPES: TYPES, stateOf: stateOf, allowed: allowed, canPunch: canPunch, haversineM: haversineM,
    assessLocation: assessLocation, noteOk: noteOk, dateKey: dateKey, weekStart: weekStart, addDays: addDays, midnight: midnight,
    localTime: localTime, intervals: intervals, dailyTotals: dailyTotals, weekSummary: weekSummary, sortPunches: sortPunches,
    newPunchId: newPunchId, onsiteStatus: onsiteStatus, locationLabel: locationLabel, buildPayload: buildPayload,
    buildGuestPayload: buildGuestPayload, guestOk: guestOk, passwordProblem: passwordProblem, normalizeTs: normalizeTs,
    mergeServerPunches: mergeServerPunches, forOwner: forOwner, pendingPunches: pendingPunches, markSynced: markSynced,
    syncLabel: syncLabel, placeFromBDC: placeFromBDC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WT = api;
})(this);
