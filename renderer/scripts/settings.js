(function () {
  const M = (window.Meru = window.Meru || {});
  const $ = M.$;

  function applySettings() {
    const s = M.state.settings;
    const root = document.documentElement;
    document.body.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
    root.style.setProperty('--accent', s.accent);
    root.style.setProperty('--clock-font', s.clockFont);
    root.style.setProperty('--clock-size', s.clockSize + 'px');
    root.style.setProperty('--tile-w', s.tileSize + 'px');
    root.style.setProperty('--wp-blur', s.wallpaperBlur + 'px');
    root.style.setProperty('--wp-dim', String(Math.max(0, Math.min(100, s.wallpaperDim)) / 100));
    $('#portal').dataset.pos = s.clockPos;
    const wp = $('#wallpaper');
    if (s.wallpaper) {
      const safe = String(s.wallpaper).replace(/["\\]/g, '\\$&');
      wp.style.backgroundImage = 'url("' + safe + '")';
    } else {
      wp.style.backgroundImage = '';
    }
    if (M.applyWidgets) M.applyWidgets();
  }

  function populate() {
    const s = M.state.settings;
    $('#optTheme').value = s.theme === 'light' ? 'light' : 'dark';
    $('#optAccent').value = /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : '#ff5a4d';
    $('#opt24').checked = !!s.clock24;
    $('#optSec').checked = !!s.seconds;
    $('#optGreet').checked = !!s.greeting;
    $('#optClockFont').value = s.clockFont;
    $('#optClockSize').value = s.clockSize;
    $('#optClockPos').value = s.clockPos;
    $('#optTileSize').value = s.tileSize;
    $('#wpUrl').value = /^https?:\/\//i.test(s.wallpaper || '') ? s.wallpaper : '';
    $('#wpBlur').value = s.wallpaperBlur;
    $('#wpDim').value = s.wallpaperDim;

    const sel = $('#optEngine');
    sel.innerHTML = '';
    s.engines.forEach(e => sel.append(M.el('option', { value: e.name, text: e.name })));
    sel.value = s.defaultEngine;

    renderEngineList();

    ['notes', 'todo', 'calendar', 'weather', 'quote', 'clipboard'].forEach(k => {
      const id = '#w' + k.charAt(0).toUpperCase() + k.slice(1);
      const el = $(id);
      if (el) el.checked = !!s.widgets[k];
    });

    $('#optOpen').value = s.openIn === 'external' ? 'external' : 'app';
    $('#optHome').value = s.homepage || '';
    $('#bindSearch').textContent = s.keys.search || '/';
    $('#bindPalette').textContent = s.keys.palette || 'Ctrl+K';
    $('#bindSettings').textContent = s.keys.settings || 'Ctrl+,';
  }

  function renderEngineList() {
    const list = $('#engineList');
    if (!list) return;
    list.innerHTML = '';
    M.state.settings.engines.forEach((e, i) => {
      const li = M.el('li');
      li.append(
        M.el('span', { class: 'en', text: e.name }),
        M.el('span', { class: 'eu', text: e.url })
      );
      const rm = M.el('button', { type: 'button', class: 'rm', text: '\u00d7', 'aria-label': 'Remove engine' });
      rm.addEventListener('click', () => {
        if (M.state.settings.engines.length <= 1) { M.toast('Keep at least one search engine'); return; }
        M.state.settings.engines.splice(i, 1);
        if (!M.state.settings.engines.some(x => x.name === M.state.settings.defaultEngine)) {
          M.state.settings.defaultEngine = M.state.settings.engines[0].name;
        }
        M.saveSettings();
        populate();
        M.renderEngines();
      });
      li.append(rm);
      list.append(li);
    });
  }

  function bindAppearance() {
    $('#optTheme').addEventListener('change', e => {
      M.state.settings.theme = e.target.value;
      M.saveSettings();
      applySettings();
    });
    $('#optAccent').addEventListener('input', e => {
      M.state.settings.accent = e.target.value;
      M.saveSettings();
      applySettings();
    });
    $('#opt24').addEventListener('change', e => {
      M.state.settings.clock24 = e.target.checked;
      M.saveSettings();
      if (M.tickClock) M.tickClock();
    });
    $('#optSec').addEventListener('change', e => {
      M.state.settings.seconds = e.target.checked;
      M.saveSettings();
      if (M.tickClock) M.tickClock();
    });
    $('#optGreet').addEventListener('change', e => {
      M.state.settings.greeting = e.target.checked;
      M.saveSettings();
      if (M.tickClock) M.tickClock();
    });
    $('#optClockFont').addEventListener('change', e => {
      M.state.settings.clockFont = e.target.value;
      M.saveSettings();
      applySettings();
    });
    $('#optClockSize').addEventListener('input', e => {
      M.state.settings.clockSize = Number(e.target.value);
      M.saveSettings();
      applySettings();
    });
    $('#optClockPos').addEventListener('change', e => {
      M.state.settings.clockPos = e.target.value;
      M.saveSettings();
      applySettings();
    });
    $('#optTileSize').addEventListener('input', e => {
      M.state.settings.tileSize = Number(e.target.value);
      M.saveSettings();
      applySettings();
    });
  }

  function bindWallpaper() {
    $('#wpUpload').addEventListener('click', async () => {
      if (!window.meru || !window.meru.pickWallpaper) { M.toast('Wallpaper upload works in the desktop app'); return; }
      const url = await window.meru.pickWallpaper();
      if (!url) return;
      M.state.settings.wallpaper = url;
      M.saveSettings();
      applySettings();
      populate();
      M.toast('Wallpaper updated');
    });
    $('#wpClear').addEventListener('click', () => {
      M.state.settings.wallpaper = '';
      M.saveSettings();
      applySettings();
      populate();
      M.toast('Wallpaper cleared');
    });
    $('#wpUrl').addEventListener('change', e => {
      const v = e.target.value.trim();
      if (!v) {
        M.state.settings.wallpaper = '';
      } else if (!/^https?:\/\//i.test(v)) {
        M.toast('Use a full image URL starting with https://');
        return;
      } else {
        M.state.settings.wallpaper = v;
      }
      M.saveSettings();
      applySettings();
    });
    $('#wpBlur').addEventListener('input', e => {
      M.state.settings.wallpaperBlur = Number(e.target.value);
      M.saveSettings();
      applySettings();
    });
    $('#wpDim').addEventListener('input', e => {
      M.state.settings.wallpaperDim = Number(e.target.value);
      M.saveSettings();
      applySettings();
    });
  }

  function bindSearch() {
    $('#optEngine').addEventListener('change', e => {
      M.state.settings.defaultEngine = e.target.value;
      M.saveSettings();
      M.renderEngines();
    });

    $('#engineAdd').addEventListener('click', () => {
      const name = $('#engineName').value.trim();
      let url = $('#engineUrl').value.trim();
      if (!name) { M.toast('Give the engine a name'); return; }
      if (!/^https?:\/\//i.test(url)) { M.toast('Engine URL must start with http:// or https://'); return; }
      if (!url.includes('%s')) url = url.includes('?') ? url + '&q=%s' : url + '?q=%s';
      if (M.state.settings.engines.some(e => e.name.toLowerCase() === name.toLowerCase())) {
        M.toast('An engine with that name already exists');
        return;
      }
      M.state.settings.engines.push({ name, url });
      M.saveSettings();
      $('#engineName').value = '';
      $('#engineUrl').value = '';
      populate();
      M.renderEngines();
      M.toast('Added ' + name);
    });
  }

  function bindWidgets() {
    ['notes', 'todo', 'calendar', 'weather', 'quote', 'clipboard'].forEach(k => {
      const id = '#w' + k.charAt(0).toUpperCase() + k.slice(1);
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => {
        M.state.settings.widgets[k] = el.checked;
        M.saveSettings();
        if (M.applyWidgets) M.applyWidgets();
      });
    });
  }

  function bindBrowserSettings() {
    $('#optOpen').addEventListener('change', e => {
      M.state.settings.openIn = e.target.value === 'external' ? 'external' : 'app';
      M.saveSettings();
    });
    $('#optHome').addEventListener('change', e => {
      const v = e.target.value.trim();
      M.state.settings.homepage = /^https?:\/\//i.test(v) ? v : '';
      if (v && !M.state.settings.homepage) M.toast('Homepage must start with http:// or https://');
      M.saveSettings();
    });
  }

  function bindKeys() {
    const pairs = [['#bindSearch', 'search'], ['#bindPalette', 'palette'], ['#bindSettings', 'settings']];
    pairs.forEach(([sel, key]) => {
      const btn = $(sel);
      btn.addEventListener('click', () => {
        if (btn.classList.contains('recording')) return;
        btn.classList.add('recording');
        const old = btn.textContent;
        btn.textContent = 'Press keys\u2026';
        const handler = e => {
          e.preventDefault();
          e.stopPropagation();
          if (e.key === 'Escape') { cleanup(); return; }
          if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
          M.state.settings.keys[key] = M.formatBinding(e);
          M.saveSettings();
          cleanup();
        };
        const cleanup = () => {
          btn.classList.remove('recording');
          btn.textContent = M.state.settings.keys[key] || old;
          document.removeEventListener('keydown', handler, true);
        };
        document.addEventListener('keydown', handler, true);
      });
    });
    $('#bindReset').addEventListener('click', () => {
      M.state.settings.keys = Object.assign({}, M.defaults.settings.keys);
      M.saveSettings();
      populate();
      M.toast('Keyboard shortcuts reset');
    });
  }

  function bindData() {
    $('#dataExport').addEventListener('click', async () => {
      if (!window.meru || !window.meru.storeExport) { M.toast('Export works in the desktop app'); return; }
      const p = await window.meru.storeExport();
      M.toast(p ? 'Backup saved' : 'Export cancelled');
    });
    $('#dataImport').addEventListener('click', async () => {
      if (!window.meru || !window.meru.storeImport) { M.toast('Import works in the desktop app'); return; }
      const r = await window.meru.storeImport();
      if (!r || !r.ok) { M.toast((r && r.error) || 'Import cancelled'); return; }
      M.store.replace(r.data || {});
      M.toast('Backup imported. Reloading\u2026');
      setTimeout(() => location.reload(), 600);
    });
    $('#dataClearHistory').addEventListener('click', () => {
      M.state.history = [];
      M.save('history');
      M.renderHistory();
      M.renderRecent();
      M.toast('History cleared');
    });
    $('#dataReset').addEventListener('click', async () => {
      if (!confirm('Reset everything? This deletes your shortcuts, notes, history, bookmarks and settings.')) return;
      if (window.meru && window.meru.storeReset) await window.meru.storeReset();
      location.reload();
    });
  }

  async function openAbout() {
    const dlg = $('#aboutDlg');
    const info = $('#aboutInfo');
    info.innerHTML = '';
    let data = { name: 'Meru Portal', version: '2.0.0', electron: '-', chrome: '-', node: '-', platform: navigator.platform || '-', arch: '-' };
    if (window.meru && window.meru.appInfo) {
      try { data = await window.meru.appInfo(); } catch (e) {}
    }
    $('#aboutVersion').textContent = 'Version ' + data.version;
    const rows = [
      ['Electron', data.electron],
      ['Chromium', data.chrome],
      ['Node', data.node],
      ['Platform', data.platform + ' ' + (data.arch || '')]
    ];
    rows.forEach(([k, v]) => info.append(M.el('b', { text: k }), M.el('span', { text: String(v) })));
    dlg.showModal();
  }

  M.initSettings = function () {
    populate();
    bindAppearance();
    bindWallpaper();
    bindSearch();
    bindWidgets();
    bindBrowserSettings();
    bindKeys();
    bindData();
    $('#settingsClose').addEventListener('click', () => $('#settingsDlg').close());
    $('#settingsDlg').addEventListener('click', e => { if (e.target === $('#settingsDlg')) $('#settingsDlg').close(); });
    $('#aboutBtn').addEventListener('click', openAbout);
    $('#aboutClose').addEventListener('click', () => $('#aboutDlg').close());
    $('#aboutLogs').addEventListener('click', async () => {
      if (!window.meru || !window.meru.openLogs) { M.toast('Logs work in the desktop app'); return; }
      const dir = await window.meru.openLogs();
      if (dir) M.toast('Opened log folder');
    });
    $('#aboutDlg').addEventListener('click', e => { if (e.target === $('#aboutDlg')) $('#aboutDlg').close(); });
    applySettings();
  };

  M.applySettings = applySettings;
  M.populateSettings = populate;
  M.openSettings = function () {
    populate();
    $('#settingsDlg').showModal();
  };
  M.openAbout = openAbout;
})();
