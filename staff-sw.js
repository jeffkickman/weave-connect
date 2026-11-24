/* Weave Time service worker: network-first for the staff app, cached copy when offline. */
var CACHE = 'weave-time-v12';
var ASSETS = ['staff.html', 'staff-config.js', 'staff-core.js', 'staff.js', 'staff-auth.js', 'staff-pw.js', 'staff-ping.js', 'admin-core.js', 'admin.js', 'admin-more.js', 'admin-people.js', 'driver-core.js', 'driver.js', 'admin-routes.js', 'ocr-core.js', 'wt-media.js', 'undelivered.js', 'autofill.js', 'admin-undelivered.js', 'suggestions.js', 'admin-suggest.js', 'staff.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('weave-time-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  var mine = ASSETS.some(function (f) { return u.pathname.endsWith('/' + f); });
  if (!mine) return; // leave other pages (Weave Connect) alone
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok) { var cp = r.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, cp); }); }
    return r;
  }).catch(function () { return caches.match(e.request, { ignoreSearch: true }).then(function (m) { return m || caches.match('staff.html'); }); }));
});
