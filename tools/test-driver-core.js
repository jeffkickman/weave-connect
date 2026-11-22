const assert = require('assert'); const D = require('../driver-core.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
const S = { route: 'Route 1', vehicle: 'New Van', start_odometer: '74029.1', start_packages: '141', totes: [{ label: 'Black 473', packages: '8' }, { label: '', packages: '' }], oversize_count: '3', overflow_count: '', start_stops: '88', mode: 'real' };
t('start validation: required fields, Real/Test required only when allowed, preview skips choice', () => {
  assert.deepStrictEqual(D.validateStart(S, true), []);
  assert.match(D.validateStart(Object.assign({}, S, { mode: '' }), true).join(), /Real route or Test/);
  assert.deepStrictEqual(D.validateStart(Object.assign({}, S, { mode: '' }), false), []);
  assert.deepStrictEqual(D.validateStart(Object.assign({}, S, { mode: '' }), true, true), []);
  assert.match(D.validateStart(Object.assign({}, S, { route: 'Other', routeOther: '' }), true).join(), /route/);
  assert.match(D.validateStart(Object.assign({}, S, { start_odometer: '74,029.15' }), true).join(), /mileage/);
  assert.match(D.validateStart(Object.assign({}, S, { start_packages: '' }), true).join(), /package/);
  assert.match(D.validateStart(Object.assign({}, S, { totes: [{ label: 'x', packages: 'a' }] }), true).join(), /Tote/);
});
t('payload: Other route text, totes trimmed, blank stays blank (unknown, not zero), is_test rules', () => {
  const p = D.startPayload(Object.assign({}, S, { route: 'Other', routeOther: 'Hub 12' }), true, false);
  assert.strictEqual(p.route_name, 'Hub 12'); assert.deepStrictEqual(p.totes, [{ label: 'Black 473', packages: 8 }]); assert.strictEqual(p.overflow_count, ''); assert.strictEqual(p.is_test, false);
  assert.strictEqual(D.startPayload(Object.assign({}, S, { mode: 'test' }), true).is_test, true);
  assert.strictEqual(D.startPayload(Object.assign({}, S, { mode: 'test' }), false).is_test, false);
  assert.strictEqual(D.startPayload(S, true, true).is_test, true);
});
t('warnings, miles, finish validation and count check', () => {
  assert.match(D.startWarnings(S).join(), /= 11, but total packages = 141/);
  assert.strictEqual(D.miles('74029.1', '74056.2'), 27.1); assert.strictEqual(D.miles('100', '90'), null);
  const st = { start_odometer: '74029.1', start_packages: 141 };
  const g = { end_odometer: '74056.2', delivered_packages: '138', returned_packages: '2', returned_reasons: 'closed', damaged_packages: '1', end_note: 'leaking' };
  assert.deepStrictEqual(D.validateFinish(g, st), []);
  assert.match(D.validateFinish(Object.assign({}, g, { end_odometer: '74000' }), st).join(), /lower/);
  assert.match(D.validateFinish(Object.assign({}, g, { returned_reasons: '' }), st).join(), /why/);
  assert.match(D.validateFinish(Object.assign({}, g, { end_note: '' }), st).join(), /missing \/ damaged/);
  assert.match(D.validateFinish(Object.assign({}, g, { returned_packages: '' }), st).join(), /returned/);
  const c = D.finishCheck(g, st); assert.strictEqual(c.diff, -1); assert(!c.ok);
  assert(D.finishCheck(Object.assign({}, g, { delivered_packages: '139' }), st).ok);
});
t('routes CSV marks TEST and quotes', () => {
  const c = D.routesCsv([{ is_test: true, route_name: 'Route 1', returned_reasons: 'closed, gate' }, { is_test: false }]).split('\n');
  assert(c[0].startsWith('date_ct,is_test')); assert(c[1].includes(',TEST,') && c[1].includes('"closed, gate"')); assert.strictEqual(c[2].split(',')[1], '');
  assert(!/\$|pay|rate/i.test(c[0]));
});
console.log(n + ' driver-core tests passed');
