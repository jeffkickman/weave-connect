const assert = require('assert');
const { pathToFileURL } = require('url');
// receipts-core attaches to global.WTReceipts; dateKey via WT if present.
global.WT = { dateKey: () => '2026-11-27' };
require('../receipts-core.js');
const R = global.WTReceipts;
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };

t('canCard: cardholder or admin, including combined roles', () => {
  assert(!R.canCard(null));
  assert(!R.canCard({ role: 'employee', roles: ['employee'] }));
  assert(R.canCard({ role: 'employee', roles: ['employee', 'cardholder'] }));
  assert(R.canCard({ role: 'admin', roles: ['admin'] }));
  assert(R.canCard({ role: 'driver', roles: ['driver', 'cardholder'] }));
});

t('validate requires amount, merchant, last4, purpose, job, photo; Other needs a note', () => {
  const base = { charge_date: '2026-11-26', amount: '12.50', merchant: 'Home Depot', card_last4: '1234', purpose: 'Paint', job_property: 'Flip house', note: '', photos: ['x'] };
  assert.strictEqual(R.validate(base), '');
  assert(R.validate(Object.assign({}, base, { amount: '' })));
  assert(R.validate(Object.assign({}, base, { card_last4: '12' })));
  assert(R.validate(Object.assign({}, base, { photos: [] })));
  assert(R.validate(Object.assign({}, base, { job_property: 'Other', note: '' })));
  assert.strictEqual(R.validate(Object.assign({}, base, { job_property: 'Other', note: 'Walmart run' })), '');
  assert(R.validate(Object.assign({}, base, { charge_date: '2026-12-01' })), 'future date');
});

t('payload stores last4 digits only and honors is_test', () => {
  const p = R.payload({ charge_date: '2026-11-26', amount: '$12.5', merchant: '  Ace  ', card_last4: '12-34', purpose: 'Nails', job_property: 'Flip house', note: '', cid: 'c1' }, true);
  assert.strictEqual(p.amount, '12.50');
  assert.strictEqual(p.card_last4, '1234');
  assert.strictEqual(p.merchant, 'Ace');
  assert.strictEqual(p.is_test, true);
  assert.strictEqual(p.client_id, 'c1');
});

t('parseReceipt fills only confident amount, date, and merchant', () => {
  const text = 'HOME DEPOT #123\nAndalusia AL\nDate 11/26/2026\nHammer 9.99\nTax 0.80\nTOTAL $10.79\nThank you';
  const g = R.parseReceipt(text);
  assert.strictEqual(g.amount, '10.79');
  assert.strictEqual(g.charge_date, '2026-11-26');
  assert.strictEqual(g.merchant, 'HOME DEPOT 123');
  const weak = R.parseReceipt('stuff\n1.00\n2.00\n3.00');
  assert(!weak.amount, 'ambiguous amounts should not fill');
});

console.log(n + ' receipts-core tests passed');
