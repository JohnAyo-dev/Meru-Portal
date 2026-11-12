(function () {
  const M = (window.Meru = window.Meru || {});
  const $ = M.$;

  const tabs = [];
  const downloads = [];
  let activeId = null;
  let seq = 0;
  let persistTimer = null;
  let restored = false;
  function canEmbed() {
    try { return typeof document.createElement('webview').loadURL === 'function'; } catch (e) { return false; }
  }

  const burl = $('#burl');

  function searchUrl(q) {
    const e = M.currentEngine();
    const base = e ? e.url : 'https://www.google.com/search?q=%s';
    const enc = encodeURIComponent(q);
    return base.includes('%s') ? base.replace(/%s/g, enc) : base + enc;
  }

  function openBrowser() {
    const b = $('#browser');
    b.classList.add('open');
    b.setAttribute('aria-hidden', 'false');
  }

  function progress(busy) {
    const p = $('#bProgress');
    p.classList.toggle('busy', busy);
    if (!busy) {
      p.classList.add('done');
      setTimeout(() => p.classList.remove('done'), 350);
    }
  }

  function renderTabs() {
    const strip = $('#tabstrip');
    strip.innerHTML = '';
    tabs.forEach(t => {
      const el = M.el('div', { class: 'tab' + (t.id === activeId ? ' active' : '') });
      el.addEventListener('click', e => { if (!e.target.closest('.tx')) activateTab(t.id); });
      el.append(M.el('span', { class: 'ttl', text: t.title || M.host(t.url) || 'New tab' }));
      const x = M.el('button', { type: 'button', class: 'tx', text: '\u00d7', 'aria-label': 'Close tab' });
      x.addEventListener('click', e => { e.stopPropagation(); closeTab(t.id); });
      el.append(x);
      strip.append(el);
    });
    const add = M.el('button', { type: 'button', class: 'tabnew', text: '+', 'aria-label': 'New tab', title: 'New tab (Ctrl+T)' });
    add.addEventListener('click', () => newTab('about:blank'));
    strip.append(add);
  }

  function updateToolbar() {
    const t = tabs.find(x => x.id === activeId);
    let back = false, fwd = false;
    if (t) {
      try { back = t.wv.canGoBack(); fwd = t.wv.canGoForward(); } catch (e) {}
    }
    $('#bBack').disabled = !back;
    $('#bFwd').disabled = !fwd;
    const bm = !!(t && M.state.bookmarks.some(b => b.url === t.url));
    const star = $('#bBookmark');
    star.textContent = bm ? '\u2605' : '\u2606';
    star.style.color = bm ? 'var(--accent)' : '';
    if (t && document.activeElement !== burl) burl.value = t.url === 'about:blank' ? '' : t.url;
  }

  function updateStartPage(tab) {
    const sp = $('#startpage');
    if (!sp) return;
    const blank = !tab || tab.url === 'about:blank';
    sp.classList.toggle('show', blank);
    sp.setAttribute('aria-hidden', blank ? 'false' : 'true');
    if (blank && M.renderStartPage) M.renderStartPage();
  }

  function activateTab(id) {
    activeId = id;
    const t = tabs.find(x => x.id === id);
    tabs.forEach(x => {
      const on = x.id === id;
      const blank = on && x.url === 'about:blank';
      x.wv.classList.toggle('active', on && !blank);
      if (x.errorEl) x.errorEl.style.display = on ? '' : 'none';
    });
    if (t) burl.value = t.url === 'about:blank' ? '' : t.url;
    updateStartPage(t);
    renderTabs();
    updateToolbar();
    progress(t ? t.loading : false);
    persistTabs();
  }

  function clearError(tab) {
    if (tab.errorEl) {
      tab.errorEl.remove();
      tab.errorEl = null;
    }
  }

  function showError(tab, e) {
    clearError(tab);
    const el = M.el('div', { class: 'errorpage' });
    const card = M.el('div', { class: 'errorcard' },
      M.el('h2', { text: 'This page could not load' }),
      M.el('p', { text: (e.errorDescription || 'Unknown error') + ' \u2014 ' + (e.validatedURL || tab.url) })
    );
    const retry = M.el('button', { type: 'button', text: 'Try again' });
    retry.addEventListener('click', () => { clearError(tab); try { tab.wv.reload(); } catch (err) {} });
    card.append(retry);
    el.append(card);
    el.style.display = activeId === tab.id ? '' : 'none';
    $('#views').append(el);
    tab.errorEl = el;
  }

  function bindWebview(tab) {
    const wv = tab.wv;
    wv.addEventListener('did-start-loading', () => {
      tab.loading = true;
      if (activeId === tab.id) progress(true);
    });
    wv.addEventListener('did-stop-loading', () => {
      tab.loading = false;
      if (activeId === tab.id) { progress(false); updateToolbar(); }
    });
    wv.addEventListener('did-navigate', e => {
      tab.url = e.url;
      clearError(tab);
      if (/^https?:/i.test(e.url)) M.recordHistory(e.url);
      if (activeId === tab.id) { if (document.activeElement !== burl) burl.value = e.url; updateToolbar(); updateStartPage(tab); }
      persistTabs();
    });
    wv.addEventListener('did-navigate-in-page', e => {
      tab.url = e.url;
      if (activeId === tab.id) { if (document.activeElement !== burl) burl.value = e.url; updateToolbar(); }
      persistTabs();
    });
    wv.addEventListener('page-title-updated', e => {
      tab.title = e.title || tab.title;
      renderTabs();
    });
    wv.addEventListener('did-fail-load', e => {
      if (e.errorCode === -3) return;
      if (e.isMainFrame === false) return;
      showError(tab, e);
    });
    wv.addEventListener('dom-ready', () => { if (activeId === tab.id) updateToolbar(); });
    wv.addEventListener('enter-html-full-screen', () => $('#browser').classList.add('immersive'));
    wv.addEventListener('leave-html-full-screen', () => $('#browser').classList.remove('immersive'));
    wv.addEventListener('found-in-page', e => {
      if (activeId !== tab.id) return;
      const r = e.result || {};
      $('#findCount').textContent = r.matches ? ((r.activeMatchOrdinal || 0) + '/' + r.matches) : '0/0';
    });
    wv.addEventListener('context-menu', e => showWebContext(tab, e));
  }

  function persistTabs() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const list = tabs.filter(t => t.url && t.url !== 'about:blank').map(t => ({ url: t.url }));
      const active = tabs.find(t => t.id === activeId);
      const activeUrl = active && active.url !== 'about:blank' ? active.url : (list[0] ? list[0].url : null);
      M.state.openTabs = { tabs: list, active: activeUrl };
      M.save('openTabs');
    }, 300);
  }

  function createTab(url) {
    const id = ++seq;
    const tab = { id, url: url || 'about:blank', title: 'New tab', zoom: 0, loading: false, errorEl: null };
    const wv = document.createElement('webview');
    wv.className = 'webview';
    wv.setAttribute('allowpopups', '');
    wv.setAttribute('src', tab.url);
    tab.wv = wv;
    tabs.push(tab);
    $('#views').append(wv);
    bindWebview(tab);
    return tab;
  }

  function restoreTabs() {
    if (restored) return;
    restored = true;
    const saved = M.state.openTabs;
    if (!saved || !Array.isArray(saved.tabs) || !saved.tabs.length) return;
    const urls = saved.tabs
      .map(t => (t && typeof t.url === 'string' ? t.url : ''))
      .filter(u => /^https?:\/\//i.test(u))
      .slice(0, 12);
    if (!urls.length) return;
    urls.forEach(u => createTab(u));
    const target = tabs.find(t => t.url === saved.active) || tabs[0];
    if (target) activateTab(target.id);
    M.toast('Restored ' + urls.length + ' tab' + (urls.length === 1 ? '' : 's'));
  }

  function newTab(url, activate) {
    if (!canEmbed()) {
      if (url && url !== 'about:blank') M.openExternal(url);
      return null;
    }
    openBrowser();
    restoreTabs();
    const tab = createTab(url);
    if (activate !== false) activateTab(tab.id);
    else renderTabs();
    persistTabs();
    return tab;
  }

  function closeTab(id) {
    const i = tabs.findIndex(t => t.id === id);
    if (i < 0) return;
    const t = tabs[i];
    if (t.url && t.url !== 'about:blank') {
      M.state.closedTabs = [{ url: t.url, title: t.title }, ...M.state.closedTabs.filter(c => c.url !== t.url)].slice(0, 20);
      M.save('closedTabs');
    }
    clearError(t);
    try { t.wv.remove(); } catch (e) {}
    tabs.splice(i, 1);
    if (activeId === id) {
      const next = tabs[i] || tabs[i - 1];
      if (next) activateTab(next.id);
      else closeBrowser();
    } else {
      renderTabs();
      persistTabs();
    }
  }

  function closeBrowser() {
    tabs.slice().forEach(t => {
      clearError(t);
      try { t.wv.remove(); } catch (e) {}
    });
    tabs.length = 0;
    activeId = null;
    $('#browser').classList.remove('open', 'immersive');
    $('#browser').setAttribute('aria-hidden', 'true');
    $('#findbar').classList.remove('open');
    $('#views').innerHTML = '';
    updateStartPage(null);
    M.state.openTabs = { tabs: [], active: null };
    M.save('openTabs');
    renderTabs();
  }

  function currentTab() {
    return tabs.find(t => t.id === activeId) || null;
  }

  function cycleTab(dir) {
    if (tabs.length < 2) return;
    const i = tabs.findIndex(t => t.id === activeId);
    const next = tabs[(i + dir + tabs.length) % tabs.length];
    if (next) activateTab(next.id);
  }

  function selectTab(n) {
    if (!tabs.length) return;
    const idx = n === 9 ? tabs.length - 1 : n - 1;
    const t = tabs[idx];
    if (t) activateTab(t.id);
  }

  function reloadActive() {
    const t = currentTab();
    if (!t) return;
    try { t.wv.reload(); } catch (e) {}
  }

  function goBack() {
    const t = currentTab();
    if (!t) return;
    try { if (t.wv.canGoBack()) t.wv.goBack(); } catch (e) {}
  }

  function goForward() {
    const t = currentTab();
    if (!t) return;
    try { if (t.wv.canGoForward()) t.wv.goForward(); } catch (e) {}
  }

  function goHome() {
    const home = M.state.settings.homepage;
    if (home && /^https?:\/\//i.test(home)) navigateActive(home);
    else closeBrowser();
  }

  function visit(url) {
    if (!url) return;
    if (!/^https?:\/\//i.test(url) && url !== 'about:blank') {
      url = M.normalizeUrl(url) || 'https://' + url;
    }
    M.recordHistory(url);
    if (M.state.settings.openIn === 'external' || !canEmbed()) {
      M.openExternal(url);
      return;
    }
    openBrowser();
    const active = tabs.find(t => t.id === activeId);
    if (active && active.url === 'about:blank') {
      active.url = url;
      try { active.wv.loadURL(url); } catch (e) { active.wv.setAttribute('src', url); }
      activateTab(active.id);
    } else {
      newTab(url);
    }
  }

  function navigateActive(q) {
    const url = M.normalizeUrl(q) || searchUrl(q);
    const t = tabs.find(x => x.id === activeId);
    if (!t) { newTab(url); return; }
    t.url = url;
    try { t.wv.loadURL(url); } catch (e) { t.wv.setAttribute('src', url); }
    clearError(t);
    activateTab(t.id);
  }

  function zoom(dir) {
    const t = tabs.find(x => x.id === activeId);
    if (!t) return;
    if (dir === 0) t.zoom = 0;
    else t.zoom = Math.max(-5, Math.min(5, t.zoom + (dir > 0 ? 0.5 : -0.5)));
    try { t.wv.setZoomLevel(t.zoom); } catch (e) {}
    M.toast('Zoom ' + Math.round(Math.pow(1.2, t.zoom) * 100) + '%');
  }

  function openFind() {
    if (!tabs.find(x => x.id === activeId)) return;
    $('#findbar').classList.add('open');
    const inp = $('#findInput');
    inp.focus();
    inp.select();
    if (inp.value) find(inp.value, true, false);
  }

  function closeFind() {
    $('#findbar').classList.remove('open');
    $('#findCount').textContent = '';
    const t = tabs.find(x => x.id === activeId);
    if (t) { try { t.wv.stopFindInPage('clearSelection'); } catch (e) {} }
  }

  function find(text, forward, findNext) {
    const t = tabs.find(x => x.id === activeId);
    if (!t || !text) return;
    try { t.wv.findInPage(text, { forward: !!forward, findNext: !!findNext }); } catch (e) {}
  }

  function showWebContext(tab, e) {
    const wv = tab.wv;
    const p = e.params || e;
    let canBack = false, canFwd = false;
    try { canBack = wv.canGoBack(); canFwd = wv.canGoForward(); } catch (err) {}
    const items = [
      { label: 'Back', action: () => { try { wv.goBack(); } catch (err) {} }, disabled: !canBack },
      { label: 'Forward', action: () => { try { wv.goForward(); } catch (err) {} }, disabled: !canFwd },
      { label: 'Reload', action: () => { try { wv.reload(); } catch (err) {} } },
      { sep: true }
    ];
    if (p.linkURL) {
      items.push(
        { label: 'Open link in new tab', action: () => newTab(p.linkURL) },
        { label: 'Open link in system browser', action: () => M.openExternal(p.linkURL) },
        { label: 'Copy link address', action: () => window.meru && window.meru.clipboardWrite && window.meru.clipboardWrite(p.linkURL) },
        { sep: true }
      );
    }
    if (p.selectionText) {
      items.push({ label: 'Copy', action: () => { try { wv.copy(); } catch (err) {} } });
    }
    if (p.isEditable) {
      items.push(
        { label: 'Cut', action: () => { try { wv.cut(); } catch (err) {} } },
        { label: 'Paste', action: () => { try { wv.paste(); } catch (err) {} } },
        { label: 'Select all', action: () => { try { wv.selectAll(); } catch (err) {} } }
      );
    }
    items.push(
      { sep: true },
      { label: 'Find in page', shortcut: 'Ctrl+F', action: openFind },
      { label: 'Zoom in', shortcut: 'Ctrl++', action: () => zoom(1) },
      { label: 'Zoom out', shortcut: 'Ctrl+-', action: () => zoom(-1) },
      { label: 'Reset zoom', shortcut: 'Ctrl+0', action: () => zoom(0) },
      { sep: true },
      { label: 'Open page in system browser', action: () => M.openExternal(tab.url) }
    );
    const rect = wv.getBoundingClientRect();
    M.showContext(items, rect.left + (p.x || 0), rect.top + (p.y || 0));
  }

  function toggleBookmark() {
    const t = tabs.find(x => x.id === activeId);
    if (!t || !/^https?:/i.test(t.url)) { M.toast('Open a page first'); return; }
    const i = M.state.bookmarks.findIndex(b => b.url === t.url);
    if (i >= 0) {
      M.state.bookmarks.splice(i, 1);
      M.toast('Bookmark removed');
    } else {
      const name = t.title && t.title !== 'New tab' ? t.title : M.guessName(t.url);
      M.state.bookmarks.unshift({ name, url: t.url, time: Date.now() });
      M.toast('Bookmarked ' + name);
    }
    M.save('bookmarks');
    renderBookmarks();
    updateToolbar();
  }

  function mergeBookmarks(items) {
    let added = 0;
    (items || []).forEach(it => {
      if (!it || !/^https?:/i.test(it.url)) return;
      if (M.state.bookmarks.some(b => b.url === it.url)) return;
      M.state.bookmarks.push({ name: it.name || M.guessName(it.url), url: it.url, time: Date.now() });
      added++;
    });
    if (added) {
      M.save('bookmarks');
      renderBookmarks();
    }
    return added;
  }

  function renderBookmarks() {
    const list = $('#bookmarkList');
    if (!list) return;
    list.innerHTML = '';
    if (!M.state.bookmarks.length) {
      list.append(M.el('li', { class: 'muted', text: 'No bookmarks yet. Use the star in the browser toolbar.' }));
      return;
    }
    M.state.bookmarks.forEach((b, i) => {
      const li = M.el('li');
      const main = M.el('button', { type: 'button', class: 'hmain' },
        M.el('div', { class: 'hn', text: b.name || b.url }),
        M.el('div', { class: 'hu', text: M.host(b.url) })
      );
      main.addEventListener('click', () => { M.closePanels(); visit(b.url); });
      const actions = M.el('span', { class: 'hactions' });
      const del = M.el('button', { type: 'button', text: '\u00d7', 'aria-label': 'Remove bookmark' });
      del.addEventListener('click', () => {
        M.state.bookmarks.splice(i, 1);
        M.save('bookmarks');
        renderBookmarks();
        updateToolbar();
      });
      actions.append(del);
      li.append(main, actions);
      list.append(li);
    });
  }

  function renderDownloads() {
    const list = $('#downloadList');
    if (!list) return;
    list.innerHTML = '';
    if (!downloads.length) {
      list.append(M.el('li', { class: 'muted', text: 'No downloads yet.' }));
      return;
    }
    downloads.slice().reverse().forEach(d => {
      const pct = d.total ? Math.round((d.received / d.total) * 100) : null;
      let meta;
      if (d.state === 'completed') meta = 'Completed';
      else if (d.state === 'cancelled' || d.state === 'interrupted') meta = 'Stopped';
      else if (d.paused) meta = 'Paused';
      else meta = pct !== null ? pct + '% of ' + Math.round(d.total / 1048576) + ' MB' : 'Downloading\u2026';
      const li = M.el('li');
      li.append(
        M.el('div', { class: 'dn', text: d.filename || 'Download' }),
        M.el('div', { class: 'dm', text: meta })
      );
      const actions = M.el('div', { class: 'dactions' });
      if (d.state === 'progressing' && !d.paused) {
        const p = M.el('button', { type: 'button', text: 'Pause' });
        p.addEventListener('click', () => window.meru.downloadAction(d.id, 'pause'));
        actions.append(p);
      }
      if (d.state === 'progressing' && d.paused) {
        const r = M.el('button', { type: 'button', text: 'Resume' });
        r.addEventListener('click', () => window.meru.downloadAction(d.id, 'resume'));
        actions.append(r);
      }
      if (d.state === 'progressing') {
        const c = M.el('button', { type: 'button', text: 'Cancel' });
        c.addEventListener('click', () => window.meru.downloadAction(d.id, 'cancel'));
        actions.append(c);
      }
      if (d.state === 'completed' && d.path) {
        const o = M.el('button', { type: 'button', text: 'Open' });
        o.addEventListener('click', () => window.meru.openDownload(d.path));
        const rv = M.el('button', { type: 'button', text: 'Show in folder' });
        rv.addEventListener('click', () => window.meru.revealDownload(d.path));
        actions.append(o, rv);
      }
      if (actions.children.length) li.append(actions);
      list.append(li);
    });
  }

  function reopenClosed() {
    const c = M.state.closedTabs.shift();
    if (!c) { M.toast('No recently closed pages'); return; }
    M.save('closedTabs');
    visit(c.url);
    M.toast('Reopened ' + (c.title || M.host(c.url)));
  }

  M.initBrowser = function () {
    $('#bBack').addEventListener('click', () => {
      const t = tabs.find(x => x.id === activeId);
      if (t) { try { t.wv.goBack(); } catch (e) {} }
    });
    $('#bFwd').addEventListener('click', () => {
      const t = tabs.find(x => x.id === activeId);
      if (t) { try { t.wv.goForward(); } catch (e) {} }
    });
    $('#bReload').addEventListener('click', () => {
      const t = tabs.find(x => x.id === activeId);
      if (t) { try { t.wv.reload(); } catch (e) {} }
    });
    $('#bHome').addEventListener('click', () => {
      const home = M.state.settings.homepage;
      if (home && /^https?:\/\//i.test(home)) navigateActive(home);
      else closeBrowser();
    });
    $('#bExt').addEventListener('click', () => {
      const t = tabs.find(x => x.id === activeId);
      if (t && /^https?:/i.test(t.url)) M.openExternal(t.url);
    });
    $('#bBookmark').addEventListener('click', toggleBookmark);
    $('#bFind').addEventListener('click', openFind);
    $('#bZoomIn').addEventListener('click', () => zoom(1));
    $('#bZoomOut').addEventListener('click', () => zoom(-1));
    $('#bDownloads').addEventListener('click', () => { renderDownloads(); M.openPanel('downloadsPanel'); });

    $('#burlForm').addEventListener('submit', e => {
      e.preventDefault();
      const q = burl.value.trim();
      if (!q) return;
      navigateActive(q);
      burl.blur();
    });

    $('#findInput').addEventListener('input', e => {
      const v = e.target.value;
      if (!v) { $('#findCount').textContent = ''; return; }
      find(v, true, false);
    });
    $('#findInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        find(e.target.value, !e.shiftKey, true);
      } else if (e.key === 'Escape') {
        closeFind();
      }
    });
    $('#findPrev').addEventListener('click', () => find($('#findInput').value, false, true));
    $('#findNext').addEventListener('click', () => find($('#findInput').value, true, true));
    $('#findClose').addEventListener('click', closeFind);

    $('#bmExport').addEventListener('click', async () => {
      if (!window.meru || !window.meru.exportBookmarks) { M.toast('Export works in the desktop app'); return; }
      const p = await window.meru.exportBookmarks(M.state.bookmarks);
      M.toast(p ? 'Bookmarks exported' : 'Export cancelled');
    });

    $('#bmImportChrome').addEventListener('click', async () => {
      if (!window.meru || !window.meru.chromeBookmarks) { M.toast('Chrome import works in the desktop app'); return; }
      try {
        const items = await window.meru.chromeBookmarks();
        if (!items || !items.length) { M.toast('No Chrome bookmarks found'); return; }
        const added = mergeBookmarks(items);
        M.toast(added ? 'Imported ' + added + ' bookmarks' : 'Bookmarks already up to date');
      } catch (e) {
        M.toast('Could not read Chrome bookmarks');
      }
    });

    $('#bmImportHtml').addEventListener('click', async () => {
      if (!window.meru || !window.meru.importBookmarksHtml) { M.toast('HTML import works in the desktop app'); return; }
      const r = await window.meru.importBookmarksHtml();
      if (!r || !r.ok) { M.toast('Import cancelled'); return; }
      const added = mergeBookmarks(r.items);
      M.toast(added ? 'Imported ' + added + ' bookmarks' : 'Bookmarks already up to date');
    });

    if (window.meru) {
      if (window.meru.onNewTab) window.meru.onNewTab(url => {
        if (!url) newTab('about:blank');
        else newTab(url);
      });
      if (window.meru.onCloseBrowser) window.meru.onCloseBrowser(closeBrowser);
      if (window.meru.onFocusUrl) window.meru.onFocusUrl(() => {
        if ($('#browser').classList.contains('open')) { burl.focus(); burl.select(); }
      });
      if (window.meru.onFind) window.meru.onFind(openFind);
      if (window.meru.onZoom) window.meru.onZoom(dir => zoom(dir));
      if (window.meru.onCloseTab) window.meru.onCloseTab(() => { if (activeId) closeTab(activeId); });
      if (window.meru.onNextTab) window.meru.onNextTab(() => cycleTab(1));
      if (window.meru.onPrevTab) window.meru.onPrevTab(() => cycleTab(-1));
      if (window.meru.onTabIndex) window.meru.onTabIndex(n => selectTab(n));
      if (window.meru.onReload) window.meru.onReload(reloadActive);
      if (window.meru.onBack) window.meru.onBack(goBack);
      if (window.meru.onForward) window.meru.onForward(goForward);
      if (window.meru.onHome) window.meru.onHome(goHome);
      if (window.meru.onReopenClosed) window.meru.onReopenClosed(reopenClosed);
      if (window.meru.onBookmark) window.meru.onBookmark(toggleBookmark);
      if (window.meru.onHistory) window.meru.onHistory(() => {
        M.renderHistory();
        M.renderRecent();
        M.openPanel('historyPanel');
      });
      if (window.meru.onClearData) window.meru.onClearData(() => {
        if (!confirm('Clear your browsing history and clipboard history?')) return;
        M.state.history = [];
        M.save('history');
        M.renderHistory();
        M.renderRecent();
        if (M.renderStartPage) M.renderStartPage();
        if (window.meru.clipboardClear) window.meru.clipboardClear();
        M.toast('Browsing data cleared');
      });
      if (window.meru.onToggleFullscreen) window.meru.onToggleFullscreen(() => {
        if (window.meru.toggleFullscreen) window.meru.toggleFullscreen();
      });
      if (window.meru.onDownloads) window.meru.onDownloads(d => {
        const i = downloads.findIndex(x => x.id === d.id);
        if (i >= 0) downloads[i] = Object.assign(downloads[i], d);
        else downloads.push(d);
        renderDownloads();
      });
      if (window.meru.onDownloadDone) window.meru.onDownloadDone(d => {
        const i = downloads.findIndex(x => x.id === d.id);
        const merged = { id: d.id, filename: d.filename, path: d.path, state: d.state, received: 0, total: 0, paused: false };
        if (i >= 0) downloads[i] = Object.assign(downloads[i], merged);
        else downloads.push(merged);
        renderDownloads();
        M.toast(d.state === 'completed' ? 'Downloaded ' + (d.filename || 'file') : 'Download stopped');
      });
    }

    renderDownloads();
    renderBookmarks();
    renderTabs();
    updateToolbar();
  };

  M.visit = visit;
  M.newTab = newTab;
  M.closeTab = closeTab;
  M.closeActiveTab = () => { if (activeId) closeTab(activeId); else closeBrowser(); };
  M.closeBrowser = closeBrowser;
  M.reopenClosed = reopenClosed;
  M.nextTab = () => cycleTab(1);
  M.prevTab = () => cycleTab(-1);
  M.selectTab = selectTab;
  M.reloadActive = reloadActive;
  M.goBack = goBack;
  M.goForward = goForward;
  M.goHome = goHome;
  M.renderBookmarks = renderBookmarks;
  M.renderDownloads = renderDownloads;
  M.toggleBookmark = toggleBookmark;
  M.zoom = zoom;
  M.openFind = openFind;
  M.openExternal = url => {
    if (!/^https?:\/\//i.test(url)) return;
    if (window.meru && window.meru.openExternal) window.meru.openExternal(url);
    else window.open(url, '_blank');
  };
  M.canEmbed = canEmbed;
})();
