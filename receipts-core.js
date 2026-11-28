/* Weave Time — receipt helpers: jobs, payment, validation, payload, optional OCR parse. Everyone may log a receipt. */
(function (root) {
  'use strict';
  var JOBS = ['Office - 1510 E Three Notch St', 'Flip house', 'Amazon routes/vehicles', 'Insurance agency', 'Other'];
  var PAYS = [{ id: 'company', label: 'Company card' }, { id: 'personal', label: 'My own money (reimburse me)' }, { id: 'unsure', label: 'Not sure' }];
  var PAID = ['personal card', 'cash', 'other'];
  function jobs(list) { return (list && list.length) ? list : JOBS; }
  function todayCt(ms) { return (root.WT && WT.dateKey) ? WT.dateKey(ms || Date.now()) : ''; }
  function money(v) {
    var n = Number(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
    return isFinite(n) && n > 0 && n < 1000000 ? (Math.round(n * 100) / 100).toFixed(2) : '';
  }
  function last4(v) { var d = String(v || '').replace(/\D/g, ''); return d.slice(0, 5); }
  function validLast4(v) { var d = last4(v); return d.length === 4 || d.length === 5 ? d : ''; }
  function cardLabel(c) {
    if (!c) return '';
    if (c.label) return c.label;
    var prod = String(c.product || '').trim().split(/\s+/)[0] || '', d = last4(c.last4);
    var tag = (c.id_kind === 'amex_suffix' || d.length === 5) ? ('6-' + d) : ('••' + d);
    return [c.issuer, prod, tag].filter(Boolean).join(' ');
  }
  function validate(f, jobList) {
    f = f || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.charge_date || '')) return 'Choose the charge date.';
    if (f.charge_date > todayCt()) return 'Charge date cannot be in the future.';
    if (!money(f.amount)) return 'Enter the amount.';
    if (String(f.merchant || '').trim().length < 2) return 'Enter the merchant.';
    if (['company', 'personal', 'unsure'].indexOf(f.payment_type) === -1) return 'Choose how it was paid.';
    var d = last4(f.card_last4);
    if (d && !validLast4(d)) return 'Card last 4 must be 4 or 5 digits.';
    if (f.payment_type === 'company' && !validLast4(d)) return 'Enter the card last 4 (or the 5-digit Amex suffix).';
    if (f.payment_type === 'personal' && PAID.indexOf(f.paid_with) === -1) return 'Say how you paid (personal card, cash, or other).';
    if (String(f.purpose || '').trim().length < 2) return 'Say what it was for.';
    if (jobs(jobList).indexOf(f.job_property) === -1) return 'Choose a job / property.';
    if (f.job_property === 'Other' && String(f.note || '').trim().length < 3) return 'Add a note for "Other".';
    if (!(f.photos && f.photos.length)) return 'Add at least one receipt photo.';
    return '';
  }
  function payload(f, isTest) {
    return {
      charge_date: f.charge_date, amount: money(f.amount), merchant: String(f.merchant || '').trim(),
      payment_type: f.payment_type, paid_with: f.paid_with || '', card_id: f.card_id || '',
      card_last4: validLast4(f.card_last4) || '', purpose: String(f.purpose || '').trim(), job_property: f.job_property,
      note: String(f.note || '').trim(), is_test: !!isTest, client_id: f.cid
    };
  }
  function parseReceipt(text) {
    var raw = String(text || ''), out = {}, lines = raw.split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    var amounts = [], reAmt = /(?:total|amount|grand\s*total)?[^\d$]{0,12}\$?\s*(\d{1,5}\.\d{2})\b/ig, m, lastTotal = '';
    while ((m = reAmt.exec(raw))) {
      var a = money(m[1]), ctx = raw.slice(Math.max(0, m.index - 16), m.index + m[0].length).toLowerCase();
      if (!a) continue;
      if (/total/.test(ctx)) lastTotal = a;
      amounts.push(a);
    }
    if (lastTotal) out.amount = lastTotal;
    else if (amounts.length === 1) out.amount = amounts[0];
    var reDate = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g, today = todayCt(), best = '';
    function okDate(y, mo, d) {
      var mm = String(mo).padStart(2, '0'), dd = String(d).padStart(2, '0');
      if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return '';
      var iso = y + '-' + mm + '-' + dd;
      return iso <= today && iso >= String(+today.slice(0, 4) - 2) + today.slice(4) ? iso : '';
    }
    while ((m = reDate.exec(raw))) {
      var y = +m[3]; if (y < 100) y += y >= 70 ? 1900 : 2000;
      var iso = okDate(String(y), m[1], m[2]); if (iso) best = iso;
    }
    var reYmd = /\b(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g;
    while ((m = reYmd.exec(raw))) { var iso2 = okDate(m[1], m[2], m[3]); if (iso2) best = iso2; }
    if (best) out.charge_date = best;
    var skip = /^(receipt|tax|total|subtotal|change|thank|visa|mastercard|amex|debit|credit|tel|phone|date|time|#)/i;
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].replace(/[^A-Za-z0-9 &.'-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (s.length >= 3 && s.length <= 40 && /[A-Za-z]{3}/.test(s) && !skip.test(s) && !/^\d/.test(s)) { out.merchant = s; break; }
    }
    return out;
  }
  root.WTReceipts = { JOBS: JOBS, PAYS: PAYS, PAID: PAID, jobs: jobs, todayCt: todayCt, money: money, last4: last4, validLast4: validLast4, cardLabel: cardLabel, validate: validate, payload: payload, parseReceipt: parseReceipt };
})(typeof window !== 'undefined' ? window : global);
