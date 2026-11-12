const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, cb) => {
  ipcRenderer.on(channel, (event, ...args) => cb(...args));
};

contextBridge.exposeInMainWorld('meru', {
  storeAll: () => ipcRenderer.invoke('store:all'),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  storeReset: () => ipcRenderer.invoke('store:reset'),
  storeExport: () => ipcRenderer.invoke('store:export'),
  storeImport: () => ipcRenderer.invoke('store:import'),
  storeStatus: () => ipcRenderer.invoke('store:status'),

  appInfo: () => ipcRenderer.invoke('app:info'),
  openLogs: () => ipcRenderer.invoke('logs:open'),

  chromeBookmarks: () => ipcRenderer.invoke('bookmarks:chrome'),
  importBookmarksHtml: () => ipcRenderer.invoke('bookmarks:importHtml'),
  exportBookmarks: (items) => ipcRenderer.invoke('bookmarks:export', items),

  pickWallpaper: () => ipcRenderer.invoke('wallpaper:pick'),
  pickAvatar: () => ipcRenderer.invoke('avatar:pick'),
  openExternal: (url) => ipcRenderer.send('shell:openExternal', url),

  downloadAction: (id, action) => ipcRenderer.invoke('downloads:action', id, action),
  revealDownload: (filePath) => ipcRenderer.invoke('downloads:reveal', filePath),
  openDownload: (filePath) => ipcRenderer.invoke('downloads:open', filePath),

  clipboardHistory: () => ipcRenderer.invoke('clipboard:get'),
  clipboardWrite: (text) => ipcRenderer.invoke('clipboard:write', text),
  clipboardClear: () => ipcRenderer.invoke('clipboard:clear'),
  clipboardDelete: (time) => ipcRenderer.invoke('clipboard:delete', time),

  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),

  onDownloads: (cb) => on('downloads:update', cb),
  onDownloadDone: (cb) => on('downloads:done', cb),
  onClipboard: (cb) => on('clipboard:update', cb),
  onNewTab: (cb) => on('browser:new-tab', cb),
  onCloseBrowser: (cb) => on('browser:close', cb),
  onFocusUrl: (cb) => on('browser:focus-url', cb),
  onFind: (cb) => on('browser:find', cb),
  onZoom: (cb) => on('browser:zoom', cb),
  onCloseTab: (cb) => on('browser:close-tab', cb),
  onNextTab: (cb) => on('browser:next-tab', cb),
  onPrevTab: (cb) => on('browser:prev-tab', cb),
  onTabIndex: (cb) => on('browser:tab-index', cb),
  onReload: (cb) => on('browser:reload', cb),
  onBack: (cb) => on('browser:back', cb),
  onForward: (cb) => on('browser:forward', cb),
  onHome: (cb) => on('browser:home', cb),
  onBookmark: (cb) => on('browser:bookmark', cb),
  onHistory: (cb) => on('browser:history', cb),
  onDownloads: (cb) => on('browser:downloads', cb),
  onClearData: (cb) => on('browser:clear-data', cb),
  onReopenClosed: (cb) => on('browser:reopen-closed', cb),
  onToggleFullscreen: (cb) => on('window:toggle-fullscreen', cb)
});
