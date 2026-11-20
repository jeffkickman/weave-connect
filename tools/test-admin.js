// Unit tests: admin-core.js (stays, CSV, Central time) and staff-ping.js (ping throttling). Run: node tools/test-admin.js
const assert = require('assert'), X = require('../admin-core.js'), P = require('../staff-ping.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
const O = { lat: 31.3154099, lng: -86.4638976 }, north = m => O.lat + m / 111195;
const pt = (min, m, desc, src) => ({ timestamp_utc: new Date(Date.UTC(2026, 10, 18, 14, min)).toISOString(), latitude: String(north(m)), longitude: String(O.lng), location_description: desc || '', onsite_status: m < 250 ? 'onsite' : 'offsite', source: src || 'ping' });
t('groupStays: consecutive points within 150 m merge; duration runs to the next stop', () => {
  const s = X.groupStays([pt(0, 0, 'Office', 'punch'), pt(3, 40), pt(6, 120), pt(9, 2000, 'Client A'), pt(12, 2050), pt(30, 2100), pt(33, 0, 'Office', 'punch')]);
  assert.strictEqual(s.length, 3);
  assert.deepStrictEqual(s.map(x => [x.count, x.minutes, x.location_description]), [[3, 9, 'Office'], [3, 24, 'Client A'], [1, 0, 'Office']]);
  assert(s[1].maps_link.startsWith('https://www.google.com/maps?q='));
  assert.strictEqual(X.groupStays([{ timestamp_utc: 'x', latitude: '', longitude: '' }]).length, 0);
});
t('groupStays: slow drift beyond 150 m from the stay start begins a new stop', () => {
  assert.strictEqual(X.groupStays([pt(0, 0), pt(3, 100), pt(6, 140), pt(9, 200)]).length, 2);
});
t('routeLink samples at most 10 points, first and last kept', () => {
  const pts = Array.from({ length: 40 }, (_, i) => pt(i, i * 100)); const u = X.routeLink(pts), parts = u.replace('https://www.google.com/maps/dir/', '').split('/');
  assert.strictEqual(parts.length, 10); assert.strictEqual(parts[0], north(0) + ',' + O.lng); assert.strictEqual(parts[9], north(3900) + ',' + O.lng);
  assert.strictEqual(X.routeLink([pt(0, 0)]), '');
});
t('Central datetime-local <-> UTC, both CST and CDT, round trip', () => {
  assert.strictEqual(X.ctInputToUtc('2026-11-18T07:00'), '2026-11-18T13:00:00.000Z');   // CST -6
  assert.strictEqual(X.ctInputToUtc('2026-07-01T07:00'), '2026-07-01T12:00:00.000Z');   // CDT -5
  assert.strictEqual(X.utcToCtInput('2026-11-18T13:00:00Z'), '2026-11-18T07:00');
  assert.strictEqual(X.utcToCtInput('2026-11-15T05:59:00Z'), '2026-11-14T23:59');      // Sat night Central = Sun UTC
  assert.strictEqual(X.ctInputToUtc(X.utcToCtInput('2026-03-09T02:30:00Z')), '2026-03-09T02:30:00.000Z');
  assert.strictEqual(X.ctInputToUtc('bad'), '');
});
t('week CSV: header, per-day hours, totals, flags, guests, formula-safe cells', () => {
  const rep = { week_start_sun: '2026-11-15', week_end_sat: '2026-11-21', guests: [{ employee_name: 'Gus', punch_type: 'clock_in', local_time_ct: 'Wed', onsite_status: 'onsite', guest_note: 'New hire', note: '', location_description: '' }],
    employees: [{ full_name: '=HYPERLINK("x")', employee_id: 'E1', email: 'a@x.com', netHours: 7.25, lunchMinutes: 30, breakMinutes: 15, punchCount: 6, shiftOpen: false, issues: [],
      offsite: [{}], edited: [], days: ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'].map(d => ({ date: d, netHours: d === '2026-11-18' ? 7.25 : 0 })) }] };
  const lines = X.weekCsv(rep).split('\r\n');
  assert.strictEqual(lines[1], 'Employee,Employee ID,Email,2026-11-15,2026-11-16,2026-11-17,2026-11-18,2026-11-19,2026-11-20,2026-11-21,Net hours,Lunch min,Break min,Punches,Offsite punches,Edited punches,Shift open,Issues');
  assert.strictEqual(lines[2], '"\'=HYPERLINK(""x"")",E1,a@x.com,0.00,0.00,0.00,7.25,0.00,0.00,0.00,7.25,30,15,6,1,0,,');
  assert(lines.some(l => l.startsWith('Gus,clock_in,Wed,onsite,New hire')));
});
t('punches CSV has every audit column', () => {
  const h = X.punchesCsv([{ punch_id: 'p1', edited_by: 'Jeffery Watson', edit_reason: 'Started early, per Amy' }]).split('\r\n');
  ['punch_id', 'edited_by', 'edit_reason', 'session_id', 'latitude', 'local_time_ct'].forEach(c => assert(h[0].split(',').includes(c), c));
  assert(h[1].includes('"Started early, per Amy"'));
});
const base = { signedIn: true, role: 'employee', visible: true, state: 'on', now: 1e6 * 1000, lastMs: 0 };
t('pingDue: only signed-in employees, on the clock, app visible, every 3 min', () => {
  assert.strictEqual(P.pingDue(base), true);
  assert.strictEqual(P.pingDue({ ...base, lastMs: base.now - 60e3 }), false);
  assert.strictEqual(P.pingDue({ ...base, lastMs: base.now - 179e3 }), false);
  assert.strictEqual(P.pingDue({ ...base, lastMs: base.now - 180e3 }), true);
  ['lunch', 'break'].forEach(s => assert.strictEqual(P.pingDue({ ...base, state: s }), true));
  assert.strictEqual(P.pingDue({ ...base, state: 'off' }), false);
  assert.strictEqual(P.pingDue({ ...base, visible: false }), false);
  assert.strictEqual(P.pingDue({ ...base, role: 'admin' }), false);
  assert.strictEqual(P.pingDue({ ...base, signedIn: false }), false);
  assert.strictEqual(P.pingDue({ ...base, mustChange: true }), false);
  assert.strictEqual(P.pingDue({ ...base, authNeeded: true }), false);
  assert.strictEqual(P.pingDue({ ...base, denied: true }), false);
  assert.strictEqual(P.pingDue({ ...base, unsupported: true }), false);
  assert.strictEqual(P.pingDue({ ...base, inFlight: true }), false);
  assert.strictEqual(P.NOTICE, "While you're clocked in, your location is shared with Jeff.");
});
t('misc labels', () => {
  assert.strictEqual(X.ageLabel(30), 'just now'); assert.strictEqual(X.ageLabel(600), '10 min ago'); assert.strictEqual(X.minutesLabel(95), '1h 35m');
  assert.deepStrictEqual(X.stateCounts([{ state: 'on' }, { state: 'on' }, { state: 'off' }, { state: 'lunch' }]), { on: 2, lunch: 1, 'break': 0, off: 1 });
  assert.strictEqual(X.addDays('2026-11-15', -7), '2026-11-08');
});
console.log(n + ' admin/ping unit tests passed');
