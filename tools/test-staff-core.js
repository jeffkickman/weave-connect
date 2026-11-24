const assert = require('assert'); const WT = require('../staff-core.js');
const P = (type, ts) => ({ type, ts: new Date(ts).toISOString(), onsite: true });
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
t('state machine', () => {
  let p = []; assert.deepStrictEqual(WT.allowed(p), ['clock_in']);
  p.push(P('clock_in', '2026-11-16T08:00:00-06:00')); assert.strictEqual(WT.stateOf(p), 'on');
  assert.deepStrictEqual(WT.allowed(p), ['clock_out', 'lunch_start', 'break_start']);
  p.push(P('lunch_start', '2026-11-16T12:00:00-06:00')); assert.deepStrictEqual(WT.allowed(p), ['lunch_end']);
  assert(!WT.canPunch(p, 'clock_out'));
  p.push(P('lunch_end', '2026-11-16T12:30:00-06:00')); assert.strictEqual(WT.stateOf(p), 'on');
  p.push(P('break_start', '2026-11-16T15:00:00-06:00')); assert.deepStrictEqual(WT.allowed(p), ['break_end']);
  p.push(P('break_end', '2026-11-16T15:15:00-06:00'));
  p.push(P('clock_out', '2026-11-16T17:00:00-06:00')); assert.strictEqual(WT.stateOf(p), 'off');
  const s = WT.weekSummary(p, '2026-11-15', Date.parse('2026-11-17T12:00:00-06:00'));
  // 9h span - 30m lunch = 8.5h; break 15m paid (included)
  assert.strictEqual(s.totals.netHours, 8.5); assert.strictEqual(s.totals.lunchMinutes, 30); assert.strictEqual(s.totals.breakMinutes, 15);
  assert.strictEqual(s.days[1].date, '2026-11-16'); assert.strictEqual(s.days[1].netHours, 8.5); assert.strictEqual(s.totals.punchCount, 6); assert.strictEqual(s.days[1].punches.length, 6);
});
t('midnight split + week boundary (Sat->Sun)', () => {
  const p = [P('clock_in', '2026-11-21T22:00:00-06:00'), P('lunch_start', '2026-11-21T23:30:00-06:00'), P('lunch_end', '2026-11-22T00:30:00-06:00'), P('clock_out', '2026-11-22T03:00:00-06:00')];
  const d = WT.dailyTotals(p).days;
  assert.strictEqual(d['2026-11-21'].paidMin, 90); assert.strictEqual(d['2026-11-21'].lunchMin, 30);
  assert.strictEqual(d['2026-11-22'].paidMin, 150); assert.strictEqual(d['2026-11-22'].lunchMin, 30);
  assert.strictEqual(WT.weekSummary(p, '2026-11-15').totals.netHours, 1.5);
  assert.strictEqual(WT.weekSummary(p, '2026-11-22').totals.netHours, 2.5);
  assert.strictEqual(WT.weekStart(Date.parse('2026-11-22T00:10:00-06:00')), '2026-11-22');
  assert.strictEqual(WT.weekStart(Date.parse('2026-11-22T05:10:00Z')), '2026-11-15'); // 11:10pm Sat Central
});
t('DST fall-back night (Nov 1 2026, 25h day)', () => {
  const p = [P('clock_in', '2026-10-31T22:00:00-05:00'), P('clock_out', '2026-11-01T06:00:00-06:00')];
  const d = WT.dailyTotals(p).days; // 2h on Oct31, 7h on Nov1 (01:00 repeats)
  assert.strictEqual(d['2026-10-31'].paidMin, 120); assert.strictEqual(d['2026-11-01'].paidMin, 420);
});
t('open shift counts to now', () => {
  const p = [P('clock_in', '2026-11-17T08:00:00-06:00'), P('break_start', '2026-11-17T09:00:00-06:00')];
  const s = WT.weekSummary(p, '2026-11-15', Date.parse('2026-11-17T09:10:00-06:00'));
  assert.strictEqual(s.totals.netHours, 1.17); assert.strictEqual(s.totals.breakMinutes, 10); assert.strictEqual(s.totals.shiftOpen, true);
});
t('geofence + note gate', () => {
  const o = WT.CONFIG.OFFICE;
  let a = WT.assessLocation({ lat: o.lat, lng: o.lng, acc: 10 }); assert(a.onsite && !a.needsNote && a.dist === 0);
  a = WT.assessLocation({ lat: o.lat + 0.0018, lng: o.lng, acc: 10 }); assert(a.dist > 190 && a.dist < 210 && a.onsite); // ~200 m
  a = WT.assessLocation({ lat: o.lat + 0.0027, lng: o.lng, acc: 10 }); assert(a.dist > 290 && !a.onsite && a.needsNote); // ~300 m
  a = WT.assessLocation(null); assert(!a.onsite && a.needsNote && a.dist === null);
  assert(!WT.noteOk('short')); assert(!WT.noteOk('   123456789  ')); assert(WT.noteOk('At client home visit'));
});
const KEYS = ['punch_id', 'punch_type', 'timestamp_utc', 'local_time_ct', 'week_start_sun', 'onsite_status', 'distance_m', 'location_description',
  'latitude', 'longitude', 'accuracy_m', 'location_status', 'note', 'source'];
t('employee punch payload (contract: action=punch + sessionToken)', () => {
  const p = { punch_id: 'abc', type: 'clock_in', ts: '2026-11-22T05:10:00.000Z', lat: 31.36, lng: -86.4639, acc: 20,
    dist: 4958, onsite: false, locStatus: 'ok', locDesc: 'Andalusia, AL 36420', note: 'Client visit downtown' };
  const pl = WT.buildPayload(p, 'K', 'TOK');
  assert.deepStrictEqual(Object.keys(pl), ['action', 'appKey', 'sessionToken'].concat(KEYS));
  assert.strictEqual(pl.action, 'punch'); assert.strictEqual(pl.sessionToken, 'TOK'); assert.strictEqual(pl.appKey, 'K');
  assert.strictEqual(pl.week_start_sun, '2026-11-15'); // 11:10 PM Sat Central belongs to prior week
  assert.strictEqual(pl.onsite_status, 'offsite'); assert.strictEqual(pl.source, 'weave-time-web'); assert.strictEqual(pl.timestamp_utc, '2026-11-22T05:10:00.000Z');
  assert(/Sat, Nov 21, 2026, 11:10 PM CST/.test(pl.local_time_ct), pl.local_time_ct);
  const none = WT.buildPayload({ punch_id: 'x', type: 'clock_out', ts: '2026-11-17T20:00:00Z', lat: null, lng: null, acc: null, dist: null, onsite: false, locStatus: 'denied', note: 'GPS off on my phone' }, 'K', 'T');
  assert.strictEqual(none.onsite_status, 'unknown'); assert.strictEqual(none.latitude, ''); assert.strictEqual(none.distance_m, '');
  assert.strictEqual(WT.onsiteStatus({ lat: 31.3, onsite: true, locStatus: 'ok' }), 'onsite');
  assert.strictEqual(WT.onsiteStatus({ onsite_status: 'offsite' }), 'offsite'); // server-provided status wins
});
t('guest payload (contract: action=guest_punch)', () => {
  const g = { punch_id: 'g1', type: 'clock_in', ts: '2026-11-19T14:00:00Z', guestName: 'New Person', guestNote: 'New hire, no login yet',
    lat: null, lng: null, acc: null, dist: null, onsite: false, locStatus: 'timeout', note: 'GPS would not lock on' };
  const pl = WT.buildGuestPayload(g, 'K');
  assert.deepStrictEqual(Object.keys(pl), ['action', 'appKey', 'guest_name', 'guest_note'].concat(KEYS));
  assert.strictEqual(pl.action, 'guest_punch'); assert.strictEqual(pl.source, 'weave-time-guest'); assert.strictEqual(pl.guest_name, 'New Person');
  assert(!('sessionToken' in pl));
  assert(!WT.guestOk('', 'New hire')); assert(!WT.guestOk('Jo Do', 'abc')); assert(WT.guestOk('Jo Do', 'abcd'));
});
t('password rules', () => {
  assert(WT.passwordProblem('', '')); assert(WT.passwordProblem('', 'x'));
  assert(WT.passwordProblem('short', 'other'));
  assert.strictEqual(WT.passwordProblem('short', 'short'), '');
  assert.strictEqual(WT.passwordProblem('longenough1', 'longenough1'), '');
});
t('employee-facing location label never leaks coords', () => {
  assert.strictEqual(WT.locationLabel({ lat: 31.3, onsite: true, locStatus: 'ok', dist: 3 }), 'Onsite');
  assert.strictEqual(WT.locationLabel({ lat: 31.36, onsite: false, locStatus: 'ok', dist: 4958 }), 'Offsite');
  assert.strictEqual(WT.locationLabel({ lat: null, locStatus: 'timeout' }), 'Location unavailable');
  assert.strictEqual(WT.locationLabel({ onsite_status: 'unknown' }), 'Location unavailable');
});
t('punch ids', () => {
  const ids = new Set(); for (let i = 0; i < 500; i++) ids.add(WT.newPunchId(null)); assert.strictEqual(ids.size, 500);
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(WT.newPunchId(null)));
  assert(/^[0-9a-f-]{36}$/.test(WT.newPunchId(require('crypto').webcrypto)));
});
t('sync queue state per account', () => {
  const E = 'a@x.com', ps = [Object.assign(P('clock_in', '2026-11-16T08:00:00-06:00'), { punch_id: '1', syncStatus: 'pending', ownerEmail: E }),
    Object.assign(P('clock_out', '2026-11-16T12:00:00-06:00'), { punch_id: '2', syncStatus: 'pending', ownerEmail: E }),
    Object.assign(P('clock_in', '2026-11-16T09:00:00-06:00'), { punch_id: '3', syncStatus: 'pending', ownerEmail: 'b@x.com' })];
  assert.strictEqual(WT.pendingPunches(ps, E).length, 2); assert.strictEqual(WT.pendingPunches(ps).length, 3);
  assert.strictEqual(WT.syncLabel(2, true, false), '2 punches waiting to sync');
  assert(WT.markSynced(ps, '1', '2026-11-16T18:00:00Z')); assert.strictEqual(ps[0].syncedAt, '2026-11-16T18:00:00Z');
  assert.strictEqual(WT.syncLabel(1, false, false), '1 punch waiting to sync (saved on this phone)');
  assert.strictEqual(WT.syncLabel(1, true, true), '1 punch waiting to sync — sign in again to send');
  assert.strictEqual(WT.syncLabel(0, true, false), 'All punches saved'); assert(!WT.markSynced(ps, 'nope', 'x'));
  assert.strictEqual(WT.forOwner(ps, E).length, 2);
});
t('merge server punches (edits win, void dropped, pending kept)', () => {
  const E = 'a@x.com';
  const local = [
    { punch_id: 's1', type: 'clock_in', ts: '2026-11-16T14:00:00.000Z', syncStatus: 'synced', ownerEmail: E, lat: 31.3, onsite: true, locStatus: 'ok' },
    { punch_id: 's2', type: 'clock_out', ts: '2026-11-16T22:00:00.000Z', syncStatus: 'synced', ownerEmail: E },
    { punch_id: 'p1', type: 'clock_in', ts: '2026-11-17T14:00:00.000Z', syncStatus: 'pending', ownerEmail: E },
    { punch_id: 'p2', type: 'clock_out', ts: '2026-11-17T15:00:00.000Z', syncStatus: 'pending', ownerEmail: E },
    { punch_id: 'o1', type: 'clock_in', ts: '2026-11-17T14:00:00.000Z', syncStatus: 'pending', ownerEmail: 'b@x.com' }];
  const server = [
    { punch_id: 's1', type: 'clock_in', ts: '2026-11-16T13:00:00.000Z', onsite_status: 'onsite', status: 'edited', note: 'Fixed by Jeff' }, // admin moved 1h earlier
    { punch_id: 's2', type: 'clock_out', ts: '2026-11-16T22:00:00.000Z', onsite_status: 'onsite', status: 'active' },
    { punch_id: 'p2', type: 'clock_out', ts: '2026-11-17T15:00:00.000Z', onsite_status: 'onsite', status: 'active' },  // arrived already
    { punch_id: 'v1', type: 'break_start', ts: '2026-11-16T18:00:00.000Z', status: 'void' },
    { punch_id: 's3', type: 'clock_in', ts: 'Wed Nov 18 2026 08:00:00 GMT-0600 (Central Standard Time)', status: 'active' }]; // Sheets Date string
  const m = WT.mergeServerPunches(local, server, E);
  const ids = m.map(p => p.punch_id).sort(); assert.deepStrictEqual(ids, ['o1', 'p1', 'p2', 's1', 's2', 's3']);
  const s1 = m.find(p => p.punch_id === 's1'); assert.strictEqual(s1.ts, '2026-11-16T13:00:00.000Z'); assert.strictEqual(s1.status, 'edited'); assert(!('lat' in s1));
  assert.strictEqual(m.find(p => p.punch_id === 'p2').syncStatus, 'synced'); assert.strictEqual(m.find(p => p.punch_id === 'p1').syncStatus, 'pending');
  assert.strictEqual(m.find(p => p.punch_id === 's3').ts, '2026-11-18T14:00:00.000Z');
  const wk = WT.weekSummary(WT.forOwner(m, E), '2026-11-15', Date.parse('2026-11-17T16:00:00Z'));
  assert.strictEqual(wk.days[1].netHours, 9); // 13:00Z-22:00Z after the admin edit (was 8)
});
t('reverse-geocode place formatting', () => {
  assert.strictEqual(WT.placeFromBDC({ city: 'Andalusia', principalSubdivisionCode: 'US-AL', postcode: '36420' }), 'Andalusia, AL 36420');
  assert.strictEqual(WT.placeFromBDC({ locality: 'Opp', principalSubdivision: 'Alabama' }), 'Opp, Alabama');
  assert.strictEqual(WT.placeFromBDC(null), '');
});
console.log(n + ' tests passed');
