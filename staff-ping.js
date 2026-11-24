/* Weave Time — on-the-clock location pings for Jeff's live view.
   Only while signed in as an employee, on the clock (working / lunch / break), and the app is open on screen.
   Pings send coordinates to the private sheet; nothing about location is ever shown on this screen. */
(function (root) {
  'use strict';
  var PING_EVERY_MS = 3 * 60 * 1000, CHECK_EVERY_MS = 30 * 1000;
  var NOTICE = "While you're clocked in, your location is shared with Jeff.";
  // Pure decision (unit-tested): should a ping go out now?
  function pingDue(o) {
    if (!o.signedIn || (o.role === 'admin' && !o.testClock) || o.mustChange || o.authNeeded) return false;   // v6: admin pings only from the Test clock
    if (!o.visible || o.state === 'off' || !o.state) return false;
    if (o.unsupported || o.denied) return false;
    if (o.inFlight) return false;
    return !o.lastMs || (o.now - o.lastMs) >= PING_EVERY_MS;
  }
  var api = { pingDue: pingDue, PING_EVERY_MS: PING_EVERY_MS, NOTICE: NOTICE };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.WTPing = api;

  var A = root.WTApp; if (!A) return;
  var S = A.settings, lastMs = 0, inFlight = false, denied = false, unsupported = false;
  function myState() { var e = A.me(); return e ? WT.stateOf(WT.modePunches(WT.forOwner(A.db().punches, e.email), A.inTestMode && A.inTestMode())) : 'off'; }
  function inputs() {
    var s = A.db().session || {}, e = s.employee || {};
    return { signedIn: !!s.token, role: e.role, testClock: !!A.db().adminTestClock, mustChange: !!s.mustChangePassword, authNeeded: !!s.authNeeded,
      visible: document.visibilityState !== 'hidden', state: myState(), unsupported: unsupported, denied: denied, inFlight: inFlight, lastMs: lastMs, now: Date.now() };
  }
  function tick() {
    if (!pingDue(inputs()) || !A.endpointReady() || !navigator.geolocation) return;
    inFlight = true; lastMs = Date.now();
    navigator.geolocation.getCurrentPosition(function (p) {
      var tok = A.db().session && A.db().session.token; if (!tok) { inFlight = false; return; }
      A.api({ action: 'location_ping', appKey: S.PUNCH_APP_KEY, sessionToken: tok, timestamp_utc: new Date().toISOString(),
        latitude: +p.coords.latitude.toFixed(6), longitude: +p.coords.longitude.toFixed(6), accuracy_m: Math.round(p.coords.accuracy), location_status: 'ok' })
        .then(function (j) { inFlight = false; if (j && /Unknown action/i.test(j.error || '')) unsupported = true; /* older server: stop quietly */ },
              function () { inFlight = false; });
    }, function (e) { inFlight = false; if (e && e.code === 1) denied = true; }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  }
  function notice() {
    var el = document.getElementById('locNote'); if (!el) return;
    var s = A.db().session, e = s && s.employee, show = !!(e && (e.role !== 'admin' || A.db().adminTestClock) && myState() !== 'off');
    el.textContent = show ? NOTICE : ''; el.hidden = !show;
  }
  A.on('render', function (sc) { if (sc === 'app') { notice(); setTimeout(tick, 1500); } });
  A.on('visible', function () { setTimeout(tick, 1500); });
  setInterval(tick, CHECK_EVERY_MS);
})(typeof window !== 'undefined' ? window : this);
