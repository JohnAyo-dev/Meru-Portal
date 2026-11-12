(function () {
  const M = (window.Meru = window.Meru || {});

  M.$ = s => document.querySelector(s);
  M.$$ = s => Array.from(document.querySelectorAll(s));

  M.el = (tag, props, ...kids) => {
    const n = document.createElement(tag);
    props = props || {};
    for (const k in props) {
      const v = props[k];
      if (v === undefined || v === null) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else n.setAttribute(k, v);
    }
    kids.flat().forEach(k => {
      if (k === undefined || k === null || k === false) return;
      n.append(k.nodeType ? k : document.createTextNode(String(k)));
    });
    return n;
  };

  M.looksLikeUrl = q => /^https?:\/\/\S+$/i.test(q) ||
    /^(?:localhost|(?:[\w-]+\.)+[a-z]{2,})(?::\d+)?(?:[\/?#]\S*)?$/i.test(q);

  M.normalizeUrl = q => {
    q = (q || '').trim();
    if (!q) return null;
    if (!M.looksLikeUrl(q)) return null;
    if (!/^https?:\/\//i.test(q)) q = 'https://' + q;
    try {
      const u = new URL(q);
      return /^https?:$/i.test(u.protocol) ? u.href : null;
    } catch (e) {
      return null;
    }
  };

  M.host = url => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return url || ''; }
  };

  M.guessName = url => {
    const h = M.host(url).split('.')[0] || 'Site';
    return h.charAt(0).toUpperCase() + h.slice(1);
  };

  M.fmtAgo = ts => {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return s + 's ago';
    const m = Math.round(s / 60);
    if (m < 60) return m + 'm ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  };

  let toastTimer = null;
  M.hideToast = () => M.$('#toast').classList.remove('show');
  M.toast = (msg, undoFn) => {
    const box = M.$('#toast');
    M.$('#toastMsg').textContent = msg;
    const btn = M.$('#undoBtn');
    btn.hidden = !undoFn;
    btn.onclick = () => { if (undoFn) undoFn(); };
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(M.hideToast, 6000);
  };

  M.openPanel = id => {
    M.$$('.panel.open').forEach(p => { if (p.id !== id) p.classList.remove('open'); });
    const p = document.getElementById(id);
    if (p) p.classList.add('open');
  };
  M.closePanels = () => M.$$('.panel.open').forEach(p => p.classList.remove('open'));

  let ctx = null;
  M.hideContext = () => {
    const c = M.$('#context');
    c.classList.remove('open');
    c.setAttribute('aria-hidden', 'true');
    c.innerHTML = '';
    ctx = null;
  };
  M.showContext = (items, x, y) => {
    const c = M.$('#context');
    c.innerHTML = '';
    items.forEach(it => {
      if (it.sep) { c.append(M.el('div', { class: 'sep' })); return; }
      const b = M.el('button', { type: 'button', disabled: it.disabled ? '' : null }, it.label);
      if (it.shortcut) b.append(M.el('span', { class: 'sc' }, it.shortcut));
      b.addEventListener('click', () => { M.hideContext(); if (!it.disabled && it.action) it.action(); });
      c.append(b);
    });
    c.classList.add('open');
    c.setAttribute('aria-hidden', 'false');
    const r = c.getBoundingClientRect();
    const px = Math.min(x, window.innerWidth - r.width - 8);
    const py = Math.min(y, window.innerHeight - r.height - 8);
    c.style.left = Math.max(8, px) + 'px';
    c.style.top = Math.max(8, py) + 'px';
    ctx = c;
  };
  document.addEventListener('mousedown', e => {
    if (ctx && !ctx.contains(e.target)) M.hideContext();
  });
  window.addEventListener('blur', () => M.hideContext());

  M.debounce = (fn, ms) => {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };
})();
