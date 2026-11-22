/* Weave Time — pure OCR text parsing (unit-tested in node): TBA numbers from a label photo, and labeled values from
   Flex / route-summary screenshots. Rules: only CONFIDENT matches are returned; conflicts and "x of y" lines are left out;
   every value is shown to the driver to check before it is saved. Nothing here guesses a number that is not in the text. */
(function (root) {
  'use strict';
  var PARSER_VERSION = 'p1';
  var REASONS = ['Business closed', 'No secure location', 'Customer unavailable / attended delivery', 'Access problem (gate/locked/no code)',
    'Address not found / bad address', 'Unsafe (dog, hazard)', 'Damaged package', 'Customer refused', 'Out of time / route ran long',
    'Missing / could not locate package', 'Weather / road closed', 'Other (note required)'];
  var DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', '!': '1', S: '5', B: '8', Z: '2' };
  // TBA + 12 digits; tolerate O/0 I/1 S/5 B/8 (and a few more) in the digit part, and T8A / 7BA for the prefix.
  function extractTba(text) {
    var src = String(text || '').toUpperCase(), out = [], seen = {};
    src.split(/\n/).concat([src.replace(/\n/g, ' ')]).forEach(function (line) {
      var s = line.replace(/[\s\-\u2013_.:,]/g, ''), re = /(?:TBA|T8A|7BA|TB4)([0-9OQDILS|!BZ]{12})(?![0-9])/g, m;
      while ((m = re.exec(s))) {
        var d = m[1].split('').map(function (c) { return DIGIT[c] || c; }).join('');
        if (/^\d{12}$/.test(d) && !seen[d]) { seen[d] = 1; out.push('TBA' + d); }
      }
    });
    return { matches: out, best: out.length === 1 ? out[0] : '' };
  }
  function normTba(v) { return String(v || '').toUpperCase().replace(/[\s\-_.]/g, ''); }
  function tbaProblem(v) {
    var t = normTba(v); if (!t) return 'Enter the TBA number.';
    if (!/^TBA\d{12}$/.test(t)) return 'TBA number must be TBA followed by exactly 12 digits.';
    return '';
  }

  // ===== screenshot auto-fill =====
  var LBL = { pk: '(?:packages?|pkgs?|parcels?)', st: '(?:stops?)' };
  function both(label, num) {   // "label: 12" and "12 label", same line only
    num = num || '(\\d{1,4})';
    return [new RegExp('\\b' + label + '\\b[^\\S\\n]*[:#=\\-]?[^\\S\\n]*' + num + '(?![\\d.:/])', 'gi'), new RegExp('(?:^|[^\\d.:/])' + num + '[^\\S\\n]*' + label + '\\b', 'gi')];
  }
  var ODO = '(\\d{3,7}(?:\\.\\d)?)';
  var RULES = {
    start: [['start_packages', both(LBL.pk)], ['start_stops', both(LBL.st)], ['overflow_count', both('overflow')], ['oversize_count', both('oversized?')],
      ['start_odometer', both('(?:odometer|odo|mileage)', ODO)]],
    end: [['delivered_packages', both('delivered')], ['returned_packages', both('(?:returned|returns|return to station|UNDLV)')],
      ['missing_packages', both('missing')], ['damaged_packages', both('damaged')],
      ['successful_stops', both('(?:successful|completed)[^\\S\\n]*' + LBL.st)], ['unsuccessful_stops', both('UNSUCC[^\\S\\n]*' + LBL.st)],
      ['end_odometer', both('(?:odometer|odo|mileage)', ODO)]]
  };
  function prep(text) {
    return String(text || '').replace(/\r/g, '').replace(/undeliver(?:ed|able)/gi, 'UNDLV').replace(/unsuccessful/gi, 'UNSUCC').replace(/[\u2018\u2019]/g, "'");
  }
  function lineAt(t, i) { var a = t.lastIndexOf('\n', i) + 1, b = t.indexOf('\n', i); return t.slice(a, b < 0 ? t.length : b); }
  function guessScreen(t) {
    var s = t.toLowerCase();
    if (/itinerary|start route|load(ing)? (your )?vehicle|pick ?up/.test(s)) return 'itinerary';
    if (/summary|delivered|return to station|completed/.test(s)) return 'summary';
    return 'unknown';
  }
  // -> { fields: {name: value}, conflicts: {name: [values]}, skipped: {name: reason}, info: {...}, screen, fieldsTried: [names] }
  function parseScreens(text, form, routes) {
    var t = prep(text), rules = RULES[form === 'end' ? 'end' : 'start'], out = { fields: {}, conflicts: {}, skipped: {}, info: {}, screen: guessScreen(t), fieldsTried: [] };
    rules.forEach(function (r) {
      var vals = {}, amb = false; out.fieldsTried.push(r[0]);
      r[1].forEach(function (re) {
        re.lastIndex = 0; var m;
        while ((m = re.exec(t))) {
          var ln = lineAt(t, m.index + m[0].length - 1);
          if (/\d+[^\S\n]*(?:of|\/)[^\S\n]*\d+/i.test(ln)) { amb = true; continue; }   // "12 of 140 packages" -> ambiguous, never filled
          vals[String(+m[1])] = 1;
        }
      });
      var k = Object.keys(vals);
      if (k.length === 1 && !amb) out.fields[r[0]] = k[0];
      else if (k.length > 1) out.conflicts[r[0]] = k;
      else if (amb) out.skipped[r[0]] = 'x of y line';
    });
    if (form !== 'end' && routes && routes.length) {
      out.fieldsTried.push('route');
      var hit = routes.filter(function (n) { return new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])', 'i').test(t); });
      if (hit.length === 1) out.fields.route = hit[0]; else if (hit.length > 1) out.conflicts.route = hit;
    }
    var st = t.match(/\b(?:station|DS)[^\S\n]*[:#]?[^\S\n]*([A-Z]{3}\d)\b/); if (st) out.info.station = st[1];
    var wv = t.match(/\bwave[^\S\n]*[:#]?[^\S\n]*(\d{1,2}:\d{2}[^\S\n]*(?:AM|PM)?)/i); if (wv) out.info.wave = wv[1].trim();
    var dt = t.match(/\b((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?[^\S\n]+[A-Z][a-z]{2,8}[^\S\n]+\d{1,2})\b/); if (dt) out.info.date = dt[1];
    var rc = t.match(/\broute[^\S\n]*(?:code|#|id)?[^\S\n]*[:#]?[^\S\n]*([A-Z]{1,3}[^\S\n]?\d{1,4})\b/); if (rc) out.info.route_code = rc[1];
    var tb = both('(?:totes?|bags?)'), tv = {}; tb.forEach(function (re) { re.lastIndex = 0; var m; while ((m = re.exec(t))) tv[+m[1]] = 1; });
    if (Object.keys(tv).length === 1) out.info.totes_or_bags = Object.keys(tv)[0];
    return out;
  }
  var api = { PARSER_VERSION: PARSER_VERSION, REASONS: REASONS, extractTba: extractTba, normTba: normTba, tbaProblem: tbaProblem, parseScreens: parseScreens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WTOcr = api;
})(this);
