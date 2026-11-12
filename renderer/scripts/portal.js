(function () {
  const M = (window.Meru = window.Meru || {});
  const $ = M.$;

  let editIndex = -1;
  let lastRemoved = null;
  let tickTimer = null;

  function tick() {
    const s = M.state.settings;
    const d = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', hour12: !s.clock24 };
    if (s.seconds) opts.second = '2-digit';
    $('#clock').textContent = d.toLocaleTimeString([], opts);
    const h = d.getHours();
    $('#part').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('#part').style.display = s.greeting ? '' : 'none';
    $('#date').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    renderStartClock();
  }

  function scheduleTick() {
    clearTimeout(tickTimer);
    const delay = 1000 - (Date.now() % 1000);
    tickTimer = setTimeout(() => { tick(); scheduleTick(); }, delay + 5);
  }

  function searchUrl(q) {
    const engine = M.currentEngine();
    const base = engine ? engine.url : 'https://www.google.com/search?q=%s';
    const enc = encodeURIComponent(q);
    return base.includes('%s') ? base.replace(/%s/g, enc) : base + enc;
  }

  function renderEngines() {
    const box = $('#engines');
    box.innerHTML = '';
    M.state.settings.engines.forEach(e => {
      const b = M.el('button', { type: 'button', text: e.name, 'aria-pressed': String(e.name === M.state.settings.defaultEngine) });
      b.addEventListener('click', () => {
        M.state.settings.defaultEngine = e.name;
        M.saveSettings();
        renderEngines();
        $('#q').focus();
      });
      box.append(b);
    });
  }

  function groups() {
    const set = new Set();
    M.state.shortcuts.forEach(t => { if (t.group) set.add(t.group); });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function renderGroups() {
    const box = $('#groups');
    box.innerHTML = '';
    const list = groups();
    if (!list.length) return;
    const active = M.state.activeGroup;
    ['All', ...list].forEach(g => {
      const b = M.el('button', { type: 'button', text: g, 'aria-pressed': String(g === active) });
      b.addEventListener('click', () => { M.state.activeGroup = g; renderGroups(); renderTiles(); });
      box.append(b);
    });
  }

  function faviconFor(t) {
    if (t.icon) return t.icon;
    try { return 'https://www.google.com/s2/favicons?sz=64&domain=' + new URL(t.url).hostname; } catch (e) { return ''; }
  }

  function renderTiles() {
    const nav = $('#tiles');
    nav.innerHTML = '';
    const active = M.state.activeGroup;
    const all = M.state.shortcuts;

    if (!all.length) {
      const empty = M.el('div', { class: 'empty' },
        'No shortcuts yet. ',
        M.el('button', { type: 'button', text: 'Add your first one', onclick: openAdd })
      );
      nav.append(empty);
      renderStartTiles();
      return;
    }

    all.forEach((t, i) => {
      if (active !== 'All' && (t.group || '') !== active) return;
      const cell = M.el('div', { class: 'cell' });
      const a = M.el('a', { class: 'tile', href: t.url, draggable: 'true', 'data-index': String(i) });
      const ico = M.el('span', { class: 'ico' });
      const letter = M.el('b', { text: (t.name[0] || '?').toUpperCase() });
      if (t.color) { letter.style.background = t.color; letter.style.color = '#0b0b0d'; }
      const img = M.el('img', { alt: '' });
      img.addEventListener('load', () => img.classList.add('ok'));
      img.addEventListener('error', () => img.remove());
      const src = faviconFor(t);
      if (src) img.src = src;
      ico.append(letter, img);
      a.append(ico, M.el('span', { class: 'name', text: t.name }));
      a.addEventListener('click', e => { e.preventDefault(); M.visit(t.url); });
      a.addEventListener('contextmenu', e => {
        e.preventDefault();
        M.showContext([
          { label: 'Open', action: () => M.visit(t.url) },
          { label: 'Open in system browser', action: () => M.openExternal(t.url) },
          { sep: true },
          { label: 'Edit shortcut', action: () => openEdit(i) },
          { label: 'Remove shortcut', action: () => removeTile(i) }
        ], e.clientX, e.clientY);
      });

      const x = M.el('button', { type: 'button', class: 'x', 'aria-label': 'Remove ' + t.name, text: '\u00d7' });
      x.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); removeTile(i); });
      cell.append(a, x);
      if (i < 9) cell.append(M.el('span', { class: 'key', text: 'Alt+' + (i + 1) }));
      nav.append(cell);
    });

    const add = M.el('button', { type: 'button', class: 'tile add' });
    add.append(M.el('b', { text: '+' }), M.el('span', { class: 'name', text: 'Add' }));
    add.addEventListener('click', openAdd);
    nav.append(add);
    renderStartTiles();
  }

  function removeTile(i) {
    const [t] = M.state.shortcuts.splice(i, 1);
    lastRemoved = { t, i };
    M.save('shortcuts');
    renderGroups();
    renderTiles();
    M.toast('Removed ' + t.name, undoRemove);
  }

  function undoRemove() {
    if (!lastRemoved) return;
    const { t, i } = lastRemoved;
    M.state.shortcuts.splice(Math.min(i, M.state.shortcuts.length), 0, t);
    lastRemoved = null;
    M.save('shortcuts');
    renderGroups();
    renderTiles();
    M.hideToast();
  }

  function openAdd() {
    editIndex = -1;
    $('#tileTitle').textContent = 'New shortcut';
    $('#tileSave').textContent = 'Add shortcut';
    $('#tileDelete').hidden = true;
    $('#tileForm').reset();
    $('#fColor').value = M.state.settings.accent || '#ff5a4d';
    $('#fUrlErr').textContent = '';
    $('#tileDlg').showModal();
    $('#fUrl').focus();
  }

  function openEdit(i) {
    const t = M.state.shortcuts[i];
    if (!t) return;
    editIndex = i;
    $('#tileTitle').textContent = 'Edit shortcut';
    $('#tileSave').textContent = 'Save changes';
    $('#tileDelete').hidden = false;
    $('#fUrl').value = t.url;
    $('#fName').value = t.name;
    $('#fGroup').value = t.group || '';
    $('#fColor').value = /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : '#ff5a4d';
    $('#fIcon').value = t.icon || '';
    $('#fUrlErr').textContent = '';
    $('#tileDlg').showModal();
    $('#fUrl').focus();
  }

  function recordHistory(url) {
    try {
      const name = (M.state.shortcuts.find(t => t.url === url) || {}).name || M.guessName(url);
      M.state.history = M.state.history.filter(h => h.url !== url);
      M.state.history.unshift({ url, name, time: Date.now() });
      M.state.history = M.state.history.slice(0, 200);
      M.save('history');
      renderRecent();
      renderHistory();
    } catch (e) {}
  }

  function renderRecent() {
    const box = $('#recent');
    box.innerHTML = '';
    M.state.history.slice(0, 6).forEach(h => {
      const a = M.el('a', { href: h.url, text: h.name || h.url, title: h.url });
      a.addEventListener('click', e => { e.preventDefault(); M.visit(h.url); });
      box.append(a);
    });
    renderStartRecent();
  }

  function renderHistory() {
    const list = $('#historyList');
    if (!list) return;
    list.innerHTML = '';
    if (!M.state.history.length) {
      list.append(M.el('li', { class: 'muted', text: 'Nothing here yet.' }));
      return;
    }
    M.state.history.forEach((h, i) => {
      const li = M.el('li');
      const main = M.el('button', { type: 'button', class: 'hmain' },
        M.el('div', { class: 'hn', text: h.name || h.url }),
        M.el('div', { class: 'hu', text: M.host(h.url) + ' \u00b7 ' + M.fmtAgo(h.time) })
      );
      main.addEventListener('click', () => { M.closePanels(); M.visit(h.url); });
      const actions = M.el('span', { class: 'hactions' });
      const del = M.el('button', { type: 'button', text: '\u00d7', 'aria-label': 'Remove' });
      del.addEventListener('click', () => {
        M.state.history.splice(i, 1);
        M.save('history');
        renderHistory();
        renderRecent();
      });
      actions.append(del);
      li.append(main, actions);
      list.append(li);
    });
  }

  function bindSearch() {
    $('#form').addEventListener('submit', e => {
      e.preventDefault();
      const q = $('#q').value.trim();
      if (!q) return;
      const url = M.normalizeUrl(q) || searchUrl(q);
      const btn = $('.go');
      btn.classList.add('busy');
      $('#goLbl').textContent = 'Opening';
      M.visit(url);
      setTimeout(() => { btn.classList.remove('busy'); $('#goLbl').textContent = 'Search'; }, 500);
    });

    $('#q').addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (e.target.value) e.target.value = '';
        else e.target.blur();
      }
    });
  }

  function bindTileDialog() {
    const dlg = $('#tileDlg');
    $('#tileCancel').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });

    $('#fUrl').addEventListener('blur', () => {
      const v = $('#fUrl').value.trim();
      if (!v) return;
      const u = M.normalizeUrl(v);
      $('#fUrlErr').textContent = u ? '' : 'That address doesn\u2019t look right. Try something like spotify.com';
      if (u && !$('#fName').value) $('#fName').value = M.guessName(u);
    });
    $('#fUrl').addEventListener('input', () => {
      if ($('#fUrlErr').textContent && M.normalizeUrl($('#fUrl').value)) $('#fUrlErr').textContent = '';
    });

    $('#tileForm').addEventListener('submit', e => {
      e.preventDefault();
      const url = M.normalizeUrl($('#fUrl').value);
      if (!url) {
        $('#fUrlErr').textContent = 'Enter a website address, like spotify.com';
        $('#fUrl').focus();
        return;
      }
      const name = $('#fName').value.trim() || M.guessName(url);
      const group = $('#fGroup').value.trim();
      const color = $('#fColor').value;
      const iconRaw = $('#fIcon').value.trim();
      const icon = /^https?:\/\//i.test(iconRaw) ? iconRaw : '';
      const tile = { name, url, group, color, icon };
      if (editIndex >= 0) M.state.shortcuts[editIndex] = tile;
      else M.state.shortcuts.push(tile);
      M.save('shortcuts');
      renderGroups();
      renderTiles();
      dlg.close();
      M.toast(editIndex >= 0 ? 'Saved ' + name : 'Added ' + name);
    });

    $('#tileDelete').addEventListener('click', () => {
      if (editIndex < 0) return;
      const t = M.state.shortcuts[editIndex];
      removeTile(editIndex);
      dlg.close();
      if (t) M.toast('Removed ' + t.name, undoRemove);
    });
  }

  function bindDrag() {
    const nav = $('#tiles');
    let dragFrom = -1;

    nav.addEventListener('dragstart', e => {
      const tile = e.target.closest('.tile[data-index]');
      if (!tile) return;
      dragFrom = Number(tile.dataset.index);
      e.dataTransfer.setData('text/plain', String(dragFrom));
      e.dataTransfer.effectAllowed = 'move';
      tile.classList.add('dragging');
    });

    nav.addEventListener('dragend', () => {
      M.$$('.tile.dragging, .tile.drop-target').forEach(t => t.classList.remove('dragging', 'drop-target'));
      dragFrom = -1;
    });

    nav.addEventListener('dragover', e => {
      const tile = e.target.closest('.tile[data-index]');
      if (!tile) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      M.$$('.tile.drop-target').forEach(t => t.classList.remove('drop-target'));
      tile.classList.add('drop-target');
    });

    nav.addEventListener('drop', e => {
      const tile = e.target.closest('.tile[data-index]');
      if (!tile) return;
      e.preventDefault();
      const from = dragFrom >= 0 ? dragFrom : Number(e.dataTransfer.getData('text/plain'));
      const to = Number(tile.dataset.index);
      if (!Number.isInteger(from) || from === to) return;
      const [moved] = M.state.shortcuts.splice(from, 1);
      M.state.shortcuts.splice(to, 0, moved);
      M.save('shortcuts');
      renderGroups();
      renderTiles();
      M.toast('Shortcuts reordered');
    });
  }

  function renderStartClock() {
    const s = M.state.settings;
    const d = new Date();
    const opts = { hour: '2-digit', minute: '2-digit', hour12: !s.clock24 };
    if (s.seconds) opts.second = '2-digit';
    if ($('#startClock')) $('#startClock').textContent = d.toLocaleTimeString([], opts);
    const h = d.getHours();
    if ($('#startPart')) $('#startPart').textContent = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    if ($('#startDate')) $('#startDate').textContent = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function renderStartTiles() {
    const nav = $('#startTiles');
    if (!nav) return;
    nav.innerHTML = '';
    M.state.shortcuts.slice(0, 8).forEach(t => {
      const a = M.el('a', { class: 'tile', href: t.url, title: t.name });
      const ico = M.el('span', { class: 'ico' });
      const letter = M.el('b', { text: (t.name[0] || '?').toUpperCase() });
      if (t.color) { letter.style.background = t.color; letter.style.color = '#0b0b0d'; }
      const img = M.el('img', { alt: '' });
      img.addEventListener('load', () => img.classList.add('ok'));
      img.addEventListener('error', () => img.remove());
      const src = faviconFor(t);
      if (src) img.src = src;
      ico.append(letter, img);
      a.append(ico, M.el('span', { class: 'name', text: t.name }));
      a.addEventListener('click', e => { e.preventDefault(); M.visit(t.url); });
      nav.append(a);
    });
  }

  function renderStartRecent() {
    const box = $('#startRecent');
    if (!box) return;
    box.innerHTML = '';
    M.state.history.slice(0, 6).forEach(h => {
      const a = M.el('a', { href: h.url, text: h.name || M.host(h.url), title: h.url });
      a.addEventListener('click', e => { e.preventDefault(); M.visit(h.url); });
      box.append(a);
    });
  }

  function renderStartPage() {
    renderStartClock();
    renderStartTiles();
    renderStartRecent();
  }

  function bindStartPage() {
    const form = $('#startForm');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const q = $('#startQ').value.trim();
      if (!q) return;
      const url = M.normalizeUrl(q) || searchUrl(q);
      $('#startQ').value = '';
      M.visit(url);
    });
    $('#startQ').addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (e.target.value) e.target.value = '';
        else e.target.blur();
      }
    });
  }

  M.initPortal = function () {
    renderEngines();
    renderGroups();
    renderTiles();
    renderRecent();
    renderHistory();
    bindSearch();
    bindStartPage();
    bindTileDialog();
    bindDrag();
    renderStartPage();
    tick();
    scheduleTick();

    $('#histClear').addEventListener('click', () => {
      M.state.history = [];
      M.save('history');
      renderHistory();
      renderRecent();
      M.toast('History cleared');
    });
  };

  M.renderStartPage = renderStartPage;

  M.renderEngines = renderEngines;
  M.renderTiles = renderTiles;
  M.renderGroups = renderGroups;
  M.renderRecent = renderRecent;
  M.renderHistory = renderHistory;
  M.recordHistory = recordHistory;
  M.openTileDialog = openAdd;
  M.undoRemove = undoRemove;
  M.tickClock = tick;
})();
