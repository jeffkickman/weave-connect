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
  const s = WT.weekSummary(p, '2026-11-15', Date.parse('2026-11-17T12:00:00-06:00'), null, { name: 'X' });
  // 9h span - 30m lunch = 8.5h; break 15m paid (included)
  assert.strictEqual(s.totals.netHours, 8.5); assert.strictEqual(s.totals.lunchMinutes, 30); assert.strictEqual(s.totals.breakMinutes, 15);
  assert.strictEqual(s.days[1].date, '2026-11-16'); assert.strictEqual(s.days[1].netHours, 8.5); assert.strictEqual(s.totals.punchCount, 6);
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
t('csv/text export', () => {
  const p = [P('clock_in', '2026-11-16T08:00:00-06:00'), Object.assign(P('clock_out', '2026-11-16T12:00:00-06:00'), { onsite: false, note: 'Left early, "doctor", appt', dist: 5000 })];
  const s = WT.weekSummary(p, '2026-11-15', Date.now(), null, { name: 'A, B', empId: '7' });
  const c = WT.toCSV(s); assert(c.includes('"A, B"')); assert(c.includes('"Left early, ""doctor"", appt"'));
  assert.strictEqual(c.trim().split('\r\n').length, 1 + 1 + 7 + 2);
  assert(WT.toText(s).includes('Net paid hours: 4.00'));
});
console.log(n + ' tests passed');
