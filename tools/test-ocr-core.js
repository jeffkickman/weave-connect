// Unit tests for ocr-core.js. The strings below are SYNTHETIC (typed by hand to exercise the patterns), not real Flex screenshots.
const assert = require('assert'), O = require('../ocr-core.js');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };
t('TBA: clean, spaced, OCR confusions, prefix confusion', () => {
  assert.strictEqual(O.extractTba('Ship to\nTBA312345678901\nX').best, 'TBA312345678901');
  assert.strictEqual(O.extractTba('TBA 3123 4567 8901').best, 'TBA312345678901');
  assert.strictEqual(O.extractTba('T8A3I2S4567B9O1').best, 'TBA312545678901');
  assert.deepStrictEqual(O.extractTba('no number here').matches, []);
  assert.strictEqual(O.extractTba('TBA1234567890123').best, '', '13 digits is not auto-matched');
  const two = O.extractTba('TBA111111111111\nTBA222222222222'); assert.strictEqual(two.best, ''); assert.strictEqual(two.matches.length, 2);
});
t('TBA validation', () => {
  assert.strictEqual(O.tbaProblem('tba 1234 5678 9012'), ''); assert.match(O.tbaProblem('TBA12'), /digits/); assert.match(O.tbaProblem('TBA1234567890'), /12 digits/); assert.match(O.tbaProblem(''), /Enter/);
});
t('start form: labeled values both orders; only confident ones', () => {
  const r = O.parseScreens('Route 9\n142 packages\nStops: 118\nOverflow 3\nWave 10:20 AM', 'start', ['Route 1', '3 Notch', 'Route 9']);
  assert.deepStrictEqual(r.fields, { start_packages: '142', start_stops: '118', overflow_count: '3', route: 'Route 9' }); assert.strictEqual(r.info.wave, '10:20 AM');
});
t('conflicts and "x of y" lines are never filled', () => {
  const r = O.parseScreens('140 packages\n141 packages\n12 of 118 stops', 'start', []);
  assert.deepStrictEqual(r.fields, {}); assert.deepStrictEqual(r.conflicts.start_packages, ['140', '141']); assert(r.skipped.start_stops);
  assert.deepStrictEqual(O.parseScreens('Route 1 and Route 9', 'start', ['Route 1', 'Route 9']).fields, {});
});
t('end form: delivered vs undelivered, successful vs unsuccessful kept apart', () => {
  const r = O.parseScreens('Delivered: 130\n4 undeliverable\nSuccessful stops 101\nUnsuccessful stops 3', 'end', []);
  assert.deepStrictEqual(r.fields, { delivered_packages: '130', returned_packages: '4', successful_stops: '101', unsuccessful_stops: '3' });
  assert.deepStrictEqual(O.parseScreens('nothing useful', 'end', []).fields, {});
});
t('reasons list', () => { assert.strictEqual(O.REASONS.length, 12); assert(O.REASONS[11].startsWith('Other')); });
console.log(n + ' ocr-core tests passed');
