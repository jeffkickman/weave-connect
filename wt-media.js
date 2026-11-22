/* Weave Time — browser helpers for photos: shrink images, on-phone OCR (Tesseract.js, loaded from a CDN only the first time
   someone reads a photo), and an IndexedDB store so queued photos survive offline / app restarts without filling localStorage. */
(function () {
  'use strict';
  var TESS_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', tessP = null, dbP = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (tessP) return tessP;
    tessP = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = TESS_URL; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = function () { window.Tesseract ? res(window.Tesseract) : rej(new Error('OCR did not load')); };
      s.onerror = function () { tessP = null; rej(new Error('Could not load the text reader (no internet?). Type the values instead.')); };
      document.head.appendChild(s);
    });
    return tessP;
  }
  function toImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () { res({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That file is not a photo this phone can read.')); };
      img.src = url;
    });
  }
  function canvasOf(img, max) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, max / Math.max(w, h));
    var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
  }
  function toBlob(c, q) { return new Promise(function (res) { c.toBlob(function (b) { res(b); }, 'image/jpeg', q); }); }
  // -> { upload: Blob (<=1280px, JPEG 0.7), ocrCanvas: canvas (<=2000px, for better text reading), thumb: dataURL }
  function prepare(file) {
    return toImage(file).then(function (x) {
      var up = canvasOf(x.img, 1280), oc = canvasOf(x.img, 2000), th = canvasOf(x.img, 240).toDataURL('image/jpeg', 0.6);
      URL.revokeObjectURL(x.url);
      return toBlob(up, 0.7).then(function (b) { return { upload: b, ocrCanvas: oc, thumb: th }; });
    });
  }
  function ocr(canvas, onPct) {
    return loadTesseract().then(function (T) {
      return T.recognize(canvas, 'eng', { logger: function (m) { if (onPct && m && m.status === 'recognizing text') onPct(Math.round((m.progress || 0) * 100)); } });
    }).then(function (r) { return (r && r.data && r.data.text) || ''; });
  }
  function b64(blob) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1] || ''); }; fr.onerror = function () { rej(fr.error); }; fr.readAsDataURL(blob); });
  }
  function idb() {
    if (dbP) return dbP;
    dbP = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no indexedDB'));
      var r = indexedDB.open('weave-time-photos', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('p'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { dbP = null; rej(r.error); };
    });
    return dbP;
  }
  function tx(mode, fn) { return idb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction('p', mode), q = fn(t.objectStore('p')); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  var store = {
    put: function (k, blob) { return tx('readwrite', function (s) { return s.put(blob, k); }); },
    get: function (k) { return idb().then(function (d) { return new Promise(function (res, rej) { var q = d.transaction('p').objectStore('p').get(k); q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { rej(q.error); }; }); }); },
    del: function (k) { return tx('readwrite', function (s) { return s.delete(k); }).catch(function () {}); }
  };
  function newId(p) { var a = new Uint8Array(8); (window.crypto || {}).getRandomValues ? window.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return p + Date.now().toString(36) + Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  window.WTMedia = { prepare: prepare, ocr: ocr, b64: b64, store: store, loadTesseract: loadTesseract, newId: newId };
})();
