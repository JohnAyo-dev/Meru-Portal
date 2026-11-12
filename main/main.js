const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog, clipboard, protocol, screen } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { Store } = require('./store');
const { Logger } = require('./logger');

const isDev = !app.isPackaged;
const SMOKE = process.argv.includes('--smoke');
const isHttp = url => typeof url === 'string' && /^https?:\/\//i.test(url);

protocol.registerSchemesAsPrivileged([
  { scheme: 'meru', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

let win = null;
let store = null;
let logger = null;
const downloads = new Map();
let clipTimer = null;
let clipHistory = [];
let saveBoundsTimer = null;

app.setAppUserModelId('com.meru.portal');

if (SMOKE) {
  app.setPath('userData', path.join(os.tmpdir(), 'meru-smoke-' + process.pid));
}

if (!SMOKE && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    logger = new Logger(path.join(app.getPath('userData'), 'logs'));
    logger.info('Meru Portal ' + app.getVersion() + ' starting on ' + process.platform + ' ' + process.arch);
    store = new Store(app.getPath('userData'), { logger });
    if (store.loadStatus.recovered) logger.warn('Store recovered from ' + store.loadStatus.loaded + ' data.');
    if (app.isPackaged) Menu.setApplicationMenu(null);
    registerWallpaperProtocol();
    registerIpc();
    setupDownloads();
    setupPermissions();
    createWindow();
    startClipboardWatcher();
  });
}

app.on('window-all-closed', () => {
  if (store) store.flush();
  app.quit();
});

app.on('before-quit', () => {
  if (store) store.flush();
  stopClipboardWatcher();
});

function reportError(label, err) {
  const detail = err && err.stack ? err.stack : String(err);
  if (logger) logger.error(label + ': ' + detail);
  console.error('[main] ' + label + ':', err);
}

process.on('uncaughtException', err => reportError('uncaught exception', err));
process.on('unhandledRejection', err => reportError('unhandled rejection', err));

app.on('render-process-gone', (e, contents, details) => {
  reportError('render process gone', details.reason);
  if (SMOKE) {
    console.error('SMOKE_FAIL: renderer process gone');
    app.exit(1);
    return;
  }
  if (!win || contents !== win.webContents || details.reason === 'clean-exit') return;
  try {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'error',
      buttons: ['Reload', 'Quit'],
      defaultId: 0,
      cancelId: 1,
      title: 'Meru Portal',
      message: 'The page stopped responding.',
      detail: 'Reason: ' + details.reason
    });
    if (choice === 0) win.reload();
    else app.quit();
  } catch (err) {}
});

app.on('child-process-gone', (e, details) => {
  reportError('child process gone', details.reason);
});

app.on('web-contents-created', (e, contents) => {
  if (contents.getType() !== 'webview') return;

  contents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url) && win) win.webContents.send('browser:new-tab', url);
    return { action: 'deny' };
  });

  contents.on('will-navigate', (event, url) => {
    const ok = isHttp(url) || url === 'about:blank' || /^blob:/i.test(url);
    if (!ok) event.preventDefault();
  });

  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const send = (channel, ...args) => {
      event.preventDefault();
      if (win) win.webContents.send(channel, ...args);
    };
    const mod = input.control || input.meta;
    const key = (input.key || '').toLowerCase();

    if (input.key === 'Escape') return send('browser:close');
    if (input.key === 'F5') return send('browser:reload');
    if (input.key === 'F11') return send('window:toggle-fullscreen');

    if (mod && key === 'l') return send('browser:focus-url');
    if (mod && key === 'f') return send('browser:find');
    if (mod && (input.key === '+' || input.key === '=')) return send('browser:zoom', 1);
    if (mod && input.key === '-') return send('browser:zoom', -1);
    if (mod && input.key === '0') return send('browser:zoom', 0);

    if (mod && key === 'r') return send('browser:reload');

    if (mod && input.shift && key === 't') return send('browser:reopen-closed');
    if (mod && key === 't') return send(input.shift ? 'browser:reopen-closed' : 'browser:new-tab');
    if (mod && key === 'w') return send('browser:close-tab');

    if (mod && input.key === 'Tab') return send(input.shift ? 'browser:prev-tab' : 'browser:next-tab');
    if (mod && /^[1-9]$/.test(input.key)) return send('browser:tab-index', Number(input.key));

    if (input.alt && input.key === 'ArrowLeft') return send('browser:back');
    if (input.alt && input.key === 'ArrowRight') return send('browser:forward');
    if (input.alt && input.key === 'Home') return send('browser:home');

    if (mod && input.shift && key === 'delete') return send('browser:clear-data');
    if (mod && key === 'd') return send('browser:bookmark');
    if (mod && key === 'h') return send('browser:history');
    if (mod && key === 'j') return send('browser:downloads');
  });
});

function readWindowState() {
  const saved = store ? store.get('windowState', null) : null;
  const fallback = { width: 1280, height: 840, x: undefined, y: undefined, maximized: false };
  if (!saved || typeof saved !== 'object') return fallback;
  const num = (value, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  const width = num(saved.width, 760, 4000);
  const height = num(saved.height, 540, 3000);
  const x = num(saved.x, -20000, 20000);
  const y = num(saved.y, -20000, 20000);
  return {
    width: width || fallback.width,
    height: height || fallback.height,
    x: x === null ? undefined : x,
    y: y === null ? undefined : y,
    maximized: !!saved.maximized
  };
}

function visibleWindowBounds(state) {
  if (state.x === undefined || state.y === undefined) {
    return { width: state.width, height: state.height };
  }
  const bounds = { x: state.x, y: state.y, width: state.width, height: state.height };
  try {
    const area = screen.getDisplayMatching(bounds).workArea;
    const visible = bounds.x < area.x + area.width - 100 &&
      bounds.x + bounds.width > area.x + 100 &&
      bounds.y < area.y + area.height - 100 &&
      bounds.y + bounds.height > area.y + 100;
    if (!visible) return { width: state.width, height: state.height };
  } catch (e) {}
  return bounds;
}

function saveWindowState() {
  if (!win || !store) return;
  try {
    const normal = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    store.set('windowState', {
      x: normal.x,
      y: normal.y,
      width: normal.width,
      height: normal.height,
      maximized: win.isMaximized()
    });
  } catch (e) {}
}

function scheduleSaveWindowState() {
  clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(saveWindowState, 400);
}

function runSmokeCheck() {
  const fail = message => {
    console.error('SMOKE_FAIL: ' + message);
    app.exit(1);
  };
  const timeout = setTimeout(() => fail('timed out waiting for the renderer'), 30000);
  let tries = 0;
  const tick = async () => {
    tries++;
    try {
      const ready = await win.webContents.executeJavaScript('window.__meruReady === true');
      if (ready) {
        clearTimeout(timeout);
        console.log('SMOKE_OK');
        app.exit(0);
        return;
      }
    } catch (e) {}
    if (tries > 120) {
      clearTimeout(timeout);
      fail('renderer did not initialise');
      return;
    }
    setTimeout(tick, 200);
  };
  win.webContents.once('did-finish-load', tick);
}

function createWindow() {
  const state = readWindowState();
  win = new BrowserWindow({
    ...visibleWindowBounds(state),
    minWidth: 760,
    minHeight: 540,
    title: 'Meru Portal',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    backgroundColor: '#0b0b0d',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: true
    }
  });

  if (state.maximized) win.maximize();

  win.once('ready-to-show', () => win.show());
  if (SMOKE) runSmokeCheck();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.on('resize', scheduleSaveWindowState);
  win.on('move', scheduleSaveWindowState);
  win.on('maximize', scheduleSaveWindowState);
  win.on('unmaximize', scheduleSaveWindowState);
  win.on('close', saveWindowState);

  win.webContents.on('will-attach-webview', (e, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    const src = params.src || '';
    if (src !== 'about:blank' && !isHttp(src)) e.preventDefault();
  });

  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('file://')) return;
    e.preventDefault();
    if (isHttp(url)) win.webContents.send('browser:new-tab', url);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttp(url)) win.webContents.send('browser:new-tab', url);
    return { action: 'deny' };
  });

  if (isDev) {
    win.webContents.on('console-message', (event, details) => {
      if (!details || typeof details !== 'object') return;
      if (details.level === 'error' || details.level === 'warning') {
        console.error('[renderer]', details.level + ':', details.message, details.sourceId ? `(${details.sourceId}:${details.lineNumber})` : '');
      }
    });
  }

  win.on('closed', () => {
    win = null;
    stopClipboardWatcher();
  });
}

function registerIpc() {
  handle('store:all', () => store.all());
  handle('store:get', (e, key) => (typeof key === 'string' ? store.get(key, null) : null));
  handle('store:set', (e, key, value) => {
    if (typeof key !== 'string') return false;
    try {
      store.set(key, value);
      return true;
    } catch (err) {
      if (logger) logger.warn('Rejected store write for "' + key + '": ' + (err && err.message));
      return false;
    }
  });
  handle('store:status', () => store.getStatus());
  handle('store:reset', () => {
    store.reset();
    return true;
  });
  handle('store:export', async () => {
    const r = await dialog.showSaveDialog(win, {
      title: 'Export Meru Portal data',
      defaultPath: 'meru-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePath) return false;
    try {
      fs.writeFileSync(r.filePath, JSON.stringify({ version: 2, data: store.all() }, null, 2), 'utf8');
      return r.filePath;
    } catch (e) {
      return false;
    }
  });
  handle('store:import', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Import Meru Portal data',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false };
    try {
      const parsed = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8'));
      const data = parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data) ? parsed.data : parsed;
      store.import(data);
      if (logger) logger.info('Imported backup from ' + r.filePaths[0]);
      return { ok: true, data: store.all() };
    } catch (e) {
      if (logger) logger.warn('Rejected backup import: ' + (e && e.message));
      return { ok: false, error: 'That file is not a valid Meru Portal backup.' };
    }
  });

  handle('app:info', () => ({
    name: app.getName(),
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    logs: path.join(app.getPath('userData'), 'logs')
  }));

  handle('logs:open', async () => {
    const dir = path.join(app.getPath('userData'), 'logs');
    try {
      fs.mkdirSync(dir, { recursive: true });
      await shell.openPath(dir);
      return dir;
    } catch (e) {
      return null;
    }
  });

  handle('bookmarks:chrome', () => readChromeBookmarks());

  handle('bookmarks:importHtml', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Import bookmarks from HTML',
      properties: ['openFile'],
      filters: [{ name: 'Bookmarks', extensions: ['html', 'htm'] }]
    });
    if (r.canceled || !r.filePaths[0]) return { ok: false, items: [] };
    try {
      const html = fs.readFileSync(r.filePaths[0], 'utf8');
      const items = [];
      const re = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let m;
      const decode = s => s
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      while ((m = re.exec(html))) {
        const url = m[1];
        if (!isHttp(url)) continue;
        const name = decode(m[2]);
        items.push({ name: name || url, url });
      }
      return { ok: true, items };
    } catch (e) {
      return { ok: false, items: [] };
    }
  });

  handle('bookmarks:export', async (e, items) => {
    if (!Array.isArray(items)) return false;
    const r = await dialog.showSaveDialog(win, {
      title: 'Export bookmarks',
      defaultPath: 'meru-bookmarks.html',
      filters: [{ name: 'HTML', extensions: ['html'] }]
    });
    if (r.canceled || !r.filePath) return false;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const body = items
      .filter(b => b && isHttp(b.url))
      .map(b => `    <DT><A HREF="${esc(b.url)}">${esc(b.name || b.url)}</A>`)
      .join('\n');
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n${body}\n</DL><p>\n`;
    try {
      fs.writeFileSync(r.filePath, html, 'utf8');
      return r.filePath;
    } catch (e) {
      return false;
    }
  });

  handle('wallpaper:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a wallpaper',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      const dir = path.join(app.getPath('userData'), 'wallpapers');
      fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(r.filePaths[0]) || '.jpg';
      const dest = path.join(dir, 'wallpaper-' + Date.now() + ext);
      fs.copyFileSync(r.filePaths[0], dest);
      return 'meru://wallpaper/' + encodeURIComponent(path.basename(dest));
    } catch (e) {
      return null;
    }
  });

  handle('avatar:pick', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a profile picture',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    });
    if (r.canceled || !r.filePaths[0]) return null;
    try {
      const dir = path.join(app.getPath('userData'), 'avatars');
      fs.mkdirSync(dir, { recursive: true });
      const ext = path.extname(r.filePaths[0]) || '.png';
      const dest = path.join(dir, 'avatar-' + Date.now() + ext);
      fs.copyFileSync(r.filePaths[0], dest);
      return 'meru://avatar/' + encodeURIComponent(path.basename(dest));
    } catch (e) {
      return null;
    }
  });

  on('shell:openExternal', (e, url) => {
    if (isHttp(url)) shell.openExternal(url);
  });

  handle('window:toggleFullscreen', () => {
    if (!win) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });

  handle('downloads:action', (e, id, action) => {
    const item = downloads.get(String(id));
    if (!item) return false;
    if (action === 'pause') item.pause();
    else if (action === 'resume' && item.canResume()) item.resume();
    else if (action === 'cancel') item.cancel();
    return true;
  });

  handle('downloads:reveal', (e, filePath) => {
    if (typeof filePath === 'string' && filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  });

  handle('downloads:open', async (e, filePath) => {
    if (typeof filePath === 'string' && filePath && fs.existsSync(filePath)) await shell.openPath(filePath);
  });

  handle('clipboard:get', () => clipHistory);
  handle('clipboard:write', (e, text) => {
    if (typeof text === 'string' && text) clipboard.writeText(text);
    return true;
  });
  handle('clipboard:clear', () => {
    clipHistory = [];
    return true;
  });
  handle('clipboard:delete', (e, time) => {
    clipHistory = clipHistory.filter(c => c.time !== time);
    return clipHistory;
  });
}

function senderIsTrusted(event) {
  return !!win && !!event && event.sender === win.webContents;
}

function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!senderIsTrusted(event)) {
      if (logger) logger.warn('Blocked IPC "' + channel + '" from an untrusted sender');
      return null;
    }
    return fn(event, ...args);
  });
}

function on(channel, fn) {
  ipcMain.on(channel, (event, ...args) => {
    if (!senderIsTrusted(event)) {
      if (logger) logger.warn('Blocked IPC "' + channel + '" from an untrusted sender');
      return;
    }
    fn(event, ...args);
  });
}

function registerWallpaperProtocol() {
  const mime = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp'
  };
  protocol.handle('meru', request => {
    try {
      const u = new URL(request.url);
      const folders = { wallpaper: 'wallpapers', avatar: 'avatars' };
      const folder = folders[u.hostname];
      if (!folder) return new Response('Not found', { status: 404 });
      const name = decodeURIComponent(u.pathname.replace(/^\//, ''));
      const file = path.join(app.getPath('userData'), folder, path.basename(name));
      if (!fs.existsSync(file)) return new Response('Not found', { status: 404 });
      const data = fs.readFileSync(file);
      return new Response(data, {
        headers: { 'content-type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' }
      });
    } catch (e) {
      return new Response('Not found', { status: 404 });
    }
  });
}

function readChromeBookmarks() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
  const out = [];
  let profiles = [];
  try {
    profiles = fs.readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory() && (d.name === 'Default' || /^Profile \d+$/.test(d.name)))
      .map(d => d.name);
  } catch (e) {
    return out;
  }

  for (const profile of profiles) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(base, profile, 'Bookmarks'), 'utf8'));
    } catch (e) {
      continue;
    }
    const walk = node => {
      if (!node) return;
      if (node.type === 'url' && isHttp(node.url)) {
        let name = (node.name || '').trim();
        if (!name) {
          try { name = new URL(node.url).hostname.replace(/^www\./, ''); } catch (e) { name = node.url; }
        }
        out.push({ name, url: node.url });
      }
      if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    Object.values(data.roots || {}).forEach(walk);
  }
  return out;
}

function setupDownloads() {
  session.defaultSession.on('will-download', (event, item) => {
    const id = String(Date.now()) + Math.random().toString(16).slice(2);
    const dir = app.getPath('downloads');
    const original = item.getFilename() || 'download';
    const ext = path.extname(original);
    const stem = path.basename(original, ext);
    let target = path.join(dir, original);
    let n = 1;
    while (fs.existsSync(target)) {
      target = path.join(dir, `${stem} (${n++})${ext}`);
    }
    item.setSavePath(target);
    downloads.set(id, item);
    if (logger) logger.info('Download started: ' + original + ' -> ' + target);

    const send = () => {
      if (!win) return;
      win.webContents.send('downloads:update', {
        id,
        filename: original,
        path: target,
        state: item.getState(),
        received: item.getReceivedBytes(),
        total: item.getTotalBytes(),
        paused: item.isPaused(),
        canResume: item.canResume()
      });
    };

    item.on('updated', send);
    item.once('done', (e, state) => {
      send();
      if (logger) logger.info('Download ' + state + ': ' + original + ' -> ' + target);
      if (win) win.webContents.send('downloads:done', { id, state, path: target, filename: original });
      downloads.delete(id);
    });
    send();
  });
}

function setupPermissions() {
  const autoAllow = new Set(['fullscreen', 'clipboard-sanitized-write']);
  const labels = {
    media: 'camera / microphone',
    geolocation: 'location',
    'clipboard-read': 'clipboard',
    'midiSysex': 'MIDI devices',
    notifications: 'notifications',
    pointerLock: 'pointer lock',
    openExternal: 'open links in other apps'
  };

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (autoAllow.has(permission)) return callback(true);
    if (labels[permission]) {
      let choice = 0;
      const opts = {
        type: 'question',
        buttons: ['Block', 'Allow'],
        defaultId: 0,
        cancelId: 0,
        title: 'Permission request',
        message: `Allow this site to use your ${labels[permission]}?`,
        detail: wc.getURL()
      };
      try {
        choice = win ? dialog.showMessageBoxSync(win, opts) : dialog.showMessageBoxSync(opts);
      } catch (e) {
        choice = 0;
      }
      if (logger) logger.info('Permission ' + permission + ' ' + (choice === 1 ? 'allowed' : 'blocked') + ' for ' + wc.getURL());
      return callback(choice === 1);
    }
    if (logger) logger.info('Permission ' + permission + ' denied for ' + wc.getURL());
    callback(false);
  });

  session.defaultSession.setPermissionCheckHandler((wc, permission) => {
    return autoAllow.has(permission) || !!labels[permission];
  });
}

function startClipboardWatcher() {
  stopClipboardWatcher();
  clipTimer = setInterval(() => {
    if (!win) return;
    let text = '';
    try { text = clipboard.readText(); } catch (e) { return; }
    if (!text || text.length > 5000) return;
    if (clipHistory[0] && clipHistory[0].text === text) return;
    clipHistory = [{ text, time: Date.now() }, ...clipHistory.filter(c => c.text !== text)].slice(0, 50);
    const payload = clipHistory.map(c => ({ text: String(c.text), time: Number(c.time) }));
    try {
      win.webContents.send('clipboard:update', payload);
    } catch (err) {
      console.error('[clip] send failed:', err);
    }
  }, 1500);
}

function stopClipboardWatcher() {
  if (clipTimer) {
    clearInterval(clipTimer);
    clipTimer = null;
  }
}
