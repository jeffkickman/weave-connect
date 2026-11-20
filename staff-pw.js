/* Weave Time — "Show password" toggle. Auto-attaches to every password field, including ones rendered later (admin forms). */
(function () {
  'use strict';
  var css = '.pwwrap{position:relative;display:block}.pwwrap input{padding-right:4.6rem}' +
    '.pwtoggle{position:absolute;right:.3rem;top:50%;transform:translateY(-50%);width:auto;min-width:3.6rem;min-height:2.6rem;margin:0;' +
    'padding:.35rem .6rem;border:1px solid #cfc8bb;border-radius:8px;background:#fff;color:#0B1F3A;font-size:.85rem;font-weight:700;cursor:pointer}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  function setShown(input, btn, shown) {
    input.type = shown ? 'text' : 'password';
    btn.textContent = shown ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', shown ? 'true' : 'false');
    btn.setAttribute('aria-label', shown ? 'Hide password' : 'Show password');
  }
  function attach(input) {
    if (input.dataset.pwToggle || input.hidden || input.type !== 'password') return;
    input.dataset.pwToggle = '1';
    var wrap = document.createElement('span'); wrap.className = 'pwwrap';
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pwtoggle';
    if (input.id) btn.setAttribute('aria-controls', input.id);
    setShown(input, btn, false);
    btn.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); setShown(input, btn, input.type === 'password'); input.focus(); });
    wrap.appendChild(btn);
    if (input.form && !input.form.dataset.pwReset) {   // hide again whenever the form is submitted
      input.form.dataset.pwReset = '1';
      input.form.addEventListener('submit', function () { hideAll(input.form); }, true);
    }
  }
  function hideAll(root) {
    (root || document).querySelectorAll('input[data-pw-toggle]').forEach(function (i) {
      var b = i.parentNode.querySelector('.pwtoggle'); if (b) setShown(i, b, false);
    });
  }
  function scan(root) { (root || document).querySelectorAll('input[type="password"]').forEach(attach); }
  scan(document);
  if (window.MutationObserver) new MutationObserver(function (muts) {
    muts.forEach(function (m) { m.addedNodes.forEach(function (n) { if (n.nodeType !== 1) return; if (n.matches && n.matches('input[type="password"]')) attach(n); else scan(n); }); });
  }).observe(document.body, { childList: true, subtree: true });
  window.WTPw = { scan: scan, hideAll: hideAll };
})();
