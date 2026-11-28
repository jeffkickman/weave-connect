global.WT = { dateKey: () => '2026-11-27' };
require('../receipts-core.js');
const assert = require('assert');
const R = global.WTReceipts;
let n = 0; const t = (name, f) => { f(); n++; console.log('ok -', name); };

const base = { charge_date: '2026-11-26', amount: '12.50', merchant: 'Home Depot', payment_type: 'company', card_last4: '1234', purpose: 'Paint', job_property: 'Flip house', note: '', photos: ['x'] };

t('validate requires payment type; company needs last 4; personal needs paid-with and last 4 is optional', () => {
  assert.strictEqual(R.validate(base), '');
  assert(R.validate(Object.assign({}, base, { payment_type: '' })));
  assert(R.validate(Object.assign({}, base, { card_last4: '' })));
  assert.strictEqual(R.validate(Object.assign({}, base, { card_last4: '11087' })), '');
  const personal = Object.assign({}, base, { payment_type: 'personal', card_last4: '', paid_with: 'cash' });
  assert.strictEqual(R.validate(personal), '');
  assert(R.validate(Object.assign({}, personal, { paid_with: '' })));
  assert.strictEqual(R.validate(Object.assign({}, base, { payment_type: 'unsure', card_last4: '' })), '');
});

t('payload stores payment fields and 4- or 5-digit last4', () => {
  const p = R.payload(Object.assign({}, base, { card_last4: '12-087', card_id: 'AMEX-1', payment_type: 'company' }), true);
  assert.strictEqual(p.card_last4, '12087');
  assert.strictEqual(p.card_id, 'AMEX-1');
  assert.strictEqual(p.payment_type, 'company');
  assert.strictEqual(p.is_test, true);
});

t('cardLabel uses ••last4 or 6-suffix for Amex', () => {
  assert.strictEqual(R.cardLabel({ issuer: 'Capital One', product: 'Spark Cash employee card', last4: '7534', id_kind: 'last4' }), 'Capital One Spark ••7534');
  assert.strictEqual(R.cardLabel({ issuer: 'American Express', product: 'Blue Cash Preferred employee card', last4: '11087', id_kind: 'amex_suffix' }), 'American Express Blue 6-11087');
});

t('parseReceipt fills only confident amount, date, and merchant', () => {
  const g = R.parseReceipt('HOME DEPOT #123\nAndalusia AL\nDate 11/26/2026\nHammer 9.99\nTax 0.80\nTOTAL $10.79\nThank you');
  assert.strictEqual(g.amount, '10.79');
  assert.strictEqual(g.charge_date, '2026-11-26');
  assert.strictEqual(g.merchant, 'HOME DEPOT 123');
  const weak = R.parseReceipt('stuff\n1.00\n2.00\n3.00');
  assert(!weak.amount, 'ambiguous amounts should not fill');
});

console.log(n + ' receipts-core tests passed');
