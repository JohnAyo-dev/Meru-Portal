(function () {
  const M = window.Meru;
  const $ = M.$;

  let paletteItems = [];
  let paletteSel = 0;

  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  function dialogOpen() {
    return !!document.querySelector('dialog[open]');
  }

  function openPalette() {
    const p = $('#palette');
    p.classList.add('open');
    p.setAttribute('aria-hidden', 'false');
    const input = $('#paletteInput');
    input.value = '';
    buildPalette('');
    input.focus();
  }

  function closePalette() {
    const p = $('#palette');
    p.classList.remove('open');
    p.setAttribute('aria-hidden', 'true');
    $('#paletteInput').blur();
  }

  function buildPalette(q) {
    const items = [];
    const add = (label, detail, action, key) => items.push({ label, detail, action, key });
    const s = M.state.settings;

    add('Open settings', 'Appearance, wallpaper, widgets, data', M.openSettings, 'Ctrl+,');
    add('Toggle focus mode', 'Hide widgets and distractions', M.toggleFocus, 'F');
    add('New tab', 'Open a blank browser tab', () => M.newTab('about:blank'), 'Ctrl+T');
    add('Downloads', 'Show recent downloads', () => { M.renderDownloads(); M.openPanel('downloadsPanel'); }, 'Ctrl+J');
    add('History', 'Show recently visited sites', () => { M.renderHistory(); M.openPanel('historyPanel'); }, 'Ctrl+H');
    add('Bookmarks', 'Show saved bookmarks', () => { M.renderBookmarks(); M.openPanel('bookmarksPanel'); });
    add('Reopen closed tab', 'Restore the last closed page', M.reopenClosed, 'Ctrl+Shift+T');
    add('About Meru Portal', 'Version and build information', M.openAbout);

    M.state.shortcuts.forEach(t => add(t.name, t.url, () => M.visit(t.url)));
    M.state.history.slice(0, 8).forEach(h => add(h.name || h.url, h.url, () => M.visit(h.url)));
    M.state.bookmarks.forEach(b => add(b.name || b.url, b.url, () => M.visit(b.url)));

    const norm = M.normalizeUrl(q);
    if (norm) {
      items.unshift({ label: 'Open ' + norm, detail: 'Address', action: () => M.visit(norm), key: 'Enter' });
    } else if (q.trim()) {
      const engine = M.currentEngine();
      const base = engine ? engine.url : 'https://www.google.com/search?q=%s';
      const enc = encodeURIComponent(q.trim());
      const url = base.includes('%s') ? base.replace(/%s/g, enc) : base + enc;
      items.unshift({ label: 'Search for \u201c' + q.trim() + '\u201d', detail: (engine ? engine.name : 'Search'), action: () => M.visit(url), key: 'Enter' });
    }

    const ql = q.trim().toLowerCase();
    const filtered = ql
      ? items.filter(it => (it.label + ' ' + (it.detail || '')).toLowerCase().includes(ql))
      : items;

    paletteItems = filtered.slice(0, 14);
    if (!paletteItems.length) paletteItems = [{ label: 'No matches', detail: '', action: null }];
    paletteSel = 0;
    renderPalette();
  }

  function renderPalette() {
    const list = $('#paletteList');
    list.innerHTML = '';
    paletteItems.forEach((it, i) => {
      const li = M.el('li', { class: i === paletteSel ? 'sel' : '' });
      li.append(M.el('span', { text: it.label }));
      if (it.key) li.append(M.el('span', { class: 'pk', text: it.key }));
      if (it.detail) li.append(M.el('span', { class: 'pd', text: it.detail }));
      li.addEventListener('mouseenter', () => { paletteSel = i; renderPalette(); });
      li.addEventListener('click', () => runPalette(i));
      list.append(li);
    });
  }

  function runPalette(i) {
    const it = paletteItems[i];
    if (!it || !it.action) return;
    closePalette();
    it.action();
  }

  function initPalette() {
    $('#paletteInput').addEventListener('input', e => buildPalette(e.target.value));
    $('#paletteInput').addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteSel + 1, paletteItems.length - 1); renderPalette(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(paletteSel - 1, 0); renderPalette(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteSel); }
      else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    });
    $('#palette').addEventListener('mousedown', e => { if (e.target === $('#palette')) closePalette(); });
  }

  function bindChrome() {
    $('#settingsBtn').addEventListener('click', M.openSettings);
    $('#focusBtn').addEventListener('click', M.toggleFocus);
    $('#downloadsBtn').addEventListener('click', () => { M.renderDownloads(); M.openPanel('downloadsPanel'); });
    const profileBtn = $('#profileBtn');
    if (profileBtn) profileBtn.addEventListener('click', () => {
      if (M.renderProfiles) M.renderProfiles();
      M.openPanel('profilePanel');
    });
    M.$$('[data-close]').forEach(b => {
      b.addEventListener('click', () => {
        const p = document.getElementById(b.dataset.close);
        if (p) p.classList.remove('open');
      });
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', e => {
      const keys = M.state.settings.keys;
      const typing = isTyping(document.activeElement);
      const modal = dialogOpen();
      const paletteOpen = $('#palette').classList.contains('open');

      if (e.key === 'Escape') {
        if (paletteOpen) { closePalette(); return; }
        if ($('#context').classList.contains('open')) { M.hideContext(); return; }
        if (M.$$('.panel.open').length) { M.closePanels(); return; }
        return;
      }

      if (paletteOpen) return;

      if (!modal && M.matchBinding(e, keys.palette)) {
        e.preventDefault();
        openPalette();
        return;
      }

      if (!modal && M.matchBinding(e, keys.settings)) {
        e.preventDefault();
        M.openSettings();
        return;
      }

      if (!modal && M.matchBinding(e, keys.search) && !typing) {
        e.preventDefault();
        $('#q').focus();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing && !modal) {
        e.preventDefault();
        if (M.undoRemove) M.undoRemove();
        return;
      }

      if (e.altKey && /^Digit[1-9]$/.test(e.code) && !typing && !modal) {
        const t = M.state.shortcuts[Number(e.code.slice(5)) - 1];
        if (t) { e.preventDefault(); M.visit(t.url); }
        return;
      }

      if (!typing && !modal && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        M.toggleFocus();
        return;
      }

      if (e.key === 'F11') {
        e.preventDefault();
        if (window.meru && window.meru.toggleFullscreen) window.meru.toggleFullscreen();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        M.reopenClosed();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        M.renderHistory();
        M.openPanel('historyPanel');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        M.renderDownloads();
        M.openPanel('downloadsPanel');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'd') {
        if ($('#browser').classList.contains('open')) {
          e.preventDefault();
          M.toggleBookmark();
        }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      const browserOpen = $('#browser').classList.contains('open');

      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        M.newTab('about:blank');
        return;
      }

      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        M.closeActiveTab();
        return;
      }

      if (mod && e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) M.prevTab();
        else M.nextTab();
        return;
      }

      if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        M.selectTab(Number(e.key));
        return;
      }

      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); M.goBack(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); M.goForward(); return; }
      if (e.altKey && e.key === 'Home') { e.preventDefault(); M.goHome(); return; }

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        M.reloadActive();
        return;
      }
      if (e.key === 'F5') {
        e.preventDefault();
        M.reloadActive();
        return;
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        M.newTab('about:blank');
        return;
      }

      if (mod && e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        if (!confirm('Clear your browsing history and clipboard history?')) return;
        M.state.history = [];
        M.save('history');
        M.renderHistory();
        M.renderRecent();
        if (M.renderStartPage) M.renderStartPage();
        if (window.meru && window.meru.clipboardClear) window.meru.clipboardClear();
        M.toast('Browsing data cleared');
        return;
      }

      if (mod && e.shiftKey && e.key.toLowerCase() === 'o' && !browserOpen) {
        e.preventDefault();
        M.renderBookmarks();
        M.openPanel('bookmarksPanel');
        return;
      }
    });
  }

  async function init() {
    await M.loadState();
    M.initPortal();
    M.initWidgets();
    M.initBrowser();
    M.initSettings();
    if (M.initProfiles) M.initProfiles();
    M.applySettings();
    bindChrome();
    bindKeyboard();
    initPalette();
    if (window.meru && window.meru.storeStatus) {
      try {
        const status = await window.meru.storeStatus();
        if (status && status.recovered) {
          M.toast(status.loaded === 'backup'
            ? 'Recovered your data from the backup file'
            : 'Data files were unreadable and have been reset');
        }
      } catch (e) {}
    }
    setTimeout(() => {
      if (M.canEmbed && !M.canEmbed()) {
        M.toast('Open links in the desktop app to use the in-app browser');
      }
    }, 1500);
    window.__meruReady = true;
  }

  M.openPalette = openPalette;

  function boot() {
    init().catch(err => {
      console.error('[meru] startup failed:', err);
      document.documentElement.dataset.startupError = '1';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
