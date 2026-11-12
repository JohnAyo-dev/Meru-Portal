(function () {
  const M = (window.Meru = window.Meru || {});

  const DATA_KEYS = ['settings', 'shortcuts', 'bookmarks', 'history', 'closedTabs', 'openTabs', 'notes', 'todos', 'weather', 'focus'];

  const DEFAULT_SETTINGS = {
    theme: 'dark',
    accent: '#ff5a4d',
    clock24: true,
    seconds: false,
    greeting: true,
    clockFont: "'Bricolage Grotesque', system-ui, sans-serif",
    clockSize: 160,
    clockPos: 'center',
    tileSize: 96,
    wallpaper: '',
    wallpaperBlur: 0,
    wallpaperDim: 45,
    openIn: 'app',
    homepage: '',
    defaultEngine: 'Google',
    engines: [
      { name: 'Google', url: 'https://www.google.com/search?q=%s' },
      { name: 'YouTube', url: 'https://www.youtube.com/results?search_query=%s' },
      { name: 'Images', url: 'https://www.google.com/search?tbm=isch&q=%s' }
    ],
    widgets: { notes: true, todo: true, calendar: true, weather: true, quote: true, clipboard: false },
    keys: { search: '/', palette: 'Ctrl+K', settings: 'Ctrl+,' }
  };

  const DEFAULT_SHORTCUTS = [
    { name: 'YouTube', url: 'https://www.youtube.com', group: 'Media', color: '#ff5a4d' },
    { name: 'GitHub', url: 'https://github.com', group: 'Work', color: '#8ab4f8' },
    { name: 'Claude', url: 'https://claude.ai', group: 'Work', color: '#d4a27f' },
    { name: 'ChatGPT', url: 'https://chatgpt.com', group: 'Work', color: '#10a37f' }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  function isUrl(value) {
    return typeof value === 'string' && /^https?:\/\//i.test(value);
  }

  function normalizeSettings(raw) {
    const base = clone(DEFAULT_SETTINGS);
    const s = Object.assign(base, raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
    s.widgets = Object.assign({}, DEFAULT_SETTINGS.widgets, s.widgets && typeof s.widgets === 'object' ? s.widgets : {});
    s.keys = Object.assign({}, DEFAULT_SETTINGS.keys, s.keys && typeof s.keys === 'object' ? s.keys : {});
    const engines = Array.isArray(s.engines)
      ? s.engines.filter(e => e && typeof e.name === 'string' && typeof e.url === 'string' && e.name.trim())
      : [];
    s.engines = engines.length ? engines : clone(DEFAULT_SETTINGS.engines);
    if (!s.engines.some(e => e.name === s.defaultEngine)) s.defaultEngine = s.engines[0].name;
    s.theme = s.theme === 'light' ? 'light' : 'dark';
    s.accent = /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : DEFAULT_SETTINGS.accent;
    s.clockFont = typeof s.clockFont === 'string' && s.clockFont ? s.clockFont : DEFAULT_SETTINGS.clockFont;
    s.clockSize = clamp(s.clockSize, 60, 220, DEFAULT_SETTINGS.clockSize);
    s.tileSize = clamp(s.tileSize, 72, 150, DEFAULT_SETTINGS.tileSize);
    s.wallpaperBlur = clamp(s.wallpaperBlur, 0, 30, 0);
    s.wallpaperDim = clamp(s.wallpaperDim, 0, 90, DEFAULT_SETTINGS.wallpaperDim);
    s.openIn = s.openIn === 'external' ? 'external' : 'app';
    s.clockPos = ['left', 'right', 'center'].includes(s.clockPos) ? s.clockPos : 'center';
    s.homepage = isUrl(s.homepage) ? s.homepage : '';
    s.wallpaper = typeof s.wallpaper === 'string' ? s.wallpaper : '';
    s.clock24 = !!s.clock24;
    s.seconds = !!s.seconds;
    s.greeting = !!s.greeting;
    return s;
  }

  function normalizeShortcuts(value) {
    if (!Array.isArray(value)) return clone(DEFAULT_SHORTCUTS);
    const list = value.filter(t => t && typeof t.name === 'string' && isUrl(t.url)).map(t => ({
      name: t.name.slice(0, 80),
      url: t.url,
      group: typeof t.group === 'string' ? t.group.slice(0, 40) : '',
      color: /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : '',
      icon: isUrl(t.icon) ? t.icon : ''
    }));
    return list;
  }

  function normalizeBookmarks(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(b => b && isUrl(b.url)).map(b => ({
      name: typeof b.name === 'string' ? b.name.slice(0, 120) : b.url,
      url: b.url,
      time: Number(b.time) || Date.now()
    })).slice(0, 5000);
  }

  function normalizeHistory(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(h => h && isUrl(h.url)).map(h => ({
      url: h.url,
      name: typeof h.name === 'string' ? h.name.slice(0, 120) : '',
      time: Number(h.time) || Date.now()
    })).slice(0, 200);
  }

  function normalizeClosedTabs(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(t => t && isUrl(t.url)).map(t => ({
      url: t.url,
      title: typeof t.title === 'string' ? t.title.slice(0, 120) : ''
    })).slice(0, 20);
  }

  function normalizeOpenTabs(value) {
    if (!value || typeof value !== 'object' || !Array.isArray(value.tabs)) return { tabs: [], active: null };
    const tabs = value.tabs
      .map(t => (t && isUrl(t.url) ? { url: t.url } : null))
      .filter(Boolean)
      .slice(0, 30);
    const active = typeof value.active === 'string' && isUrl(value.active) ? value.active : (tabs[0] ? tabs[0].url : null);
    return { tabs, active };
  }

  function normalizeTodos(value) {
    if (!Array.isArray(value)) return [];
    return value.filter(t => t && typeof t.text === 'string').map(t => ({
      text: t.text.slice(0, 500),
      done: !!t.done
    }));
  }

  function normalizeWeather(value) {
    return {
      lat: Number.isFinite(Number(value && value.lat)) ? Number(value.lat) : null,
      lon: Number.isFinite(Number(value && value.lon)) ? Number(value.lon) : null,
      city: value && typeof value.city === 'string' ? value.city.slice(0, 80) : ''
    };
  }

  function normalizeValue(key, value) {
    switch (key) {
      case 'settings': return normalizeSettings(value);
      case 'shortcuts': return normalizeShortcuts(value);
      case 'bookmarks': return normalizeBookmarks(value);
      case 'history': return normalizeHistory(value);
      case 'closedTabs': return normalizeClosedTabs(value);
      case 'openTabs': return normalizeOpenTabs(value);
      case 'notes': return typeof value === 'string' ? value.slice(0, 500000) : '';
      case 'todos': return normalizeTodos(value);
      case 'weather': return normalizeWeather(value);
      case 'focus': return !!value;
      default: return value;
    }
  }

  function defaultProfileData(overrides) {
    const data = {
      settings: clone(DEFAULT_SETTINGS),
      shortcuts: clone(DEFAULT_SHORTCUTS),
      bookmarks: [],
      history: [],
      closedTabs: [],
      openTabs: { tabs: [], active: null },
      notes: '',
      todos: [],
      weather: { lat: null, lon: null, city: '' },
      focus: false
    };
    if (overrides) {
      DATA_KEYS.forEach(k => {
        if (overrides[k] !== undefined) data[k] = normalizeValue(k, overrides[k]);
      });
    }
    return data;
  }

  function makeId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function normalizeProfiles(raw) {
    const items = [];
    const data = {};
    const seen = new Set();
    (Array.isArray(raw.items) ? raw.items : []).forEach(item => {
      if (!item || typeof item.id !== 'string' || seen.has(item.id)) return;
      seen.add(item.id);
      items.push({
        id: item.id,
        name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 60) : 'Profile',
        tagline: typeof item.tagline === 'string' ? item.tagline.slice(0, 120) : '',
        color: /^#[0-9a-f]{6}$/i.test(item.color || '') ? item.color : DEFAULT_SETTINGS.accent,
        avatar: typeof item.avatar === 'string' ? item.avatar : '',
        createdAt: Number(item.createdAt) || Date.now()
      });
      data[item.id] = defaultProfileData(raw.data && raw.data[item.id]);
    });
    if (!items.length) {
      const id = 'default';
      items.push({ id, name: 'Default', tagline: '', color: DEFAULT_SETTINGS.accent, avatar: '', createdAt: Date.now() });
      data[id] = defaultProfileData();
    }
    const activeId = items.some(i => i.id === raw.activeId) ? raw.activeId : items[0].id;
    return { version: 1, activeId, items, data };
  }

  function migrateFlat() {
    const flat = {};
    DATA_KEYS.forEach(key => {
      flat[key] = normalizeValue(key, M.store.get(key, undefined));
    });
    const id = 'default';
    return {
      version: 1,
      activeId: id,
      items: [{ id, name: 'Default', tagline: '', color: DEFAULT_SETTINGS.accent, avatar: '', createdAt: Date.now() }],
      data: { [id]: flat }
    };
  }

  function createProfileStore(profiles) {
    return {
      activeId: profiles.activeId,
      items: profiles.items,
      data: profiles.data,
      _timer: null,

      activeMeta() {
        return this.items.find(i => i.id === this.activeId) || this.items[0];
      },

      serialize() {
        return { version: 1, activeId: this.activeId, items: this.items, data: this.data };
      },

      persist(immediate) {
        clearTimeout(this._timer);
        if (immediate) {
          M.store.set('profiles', this.serialize());
          return;
        }
        this._timer = setTimeout(() => {
          M.store.set('profiles', this.serialize());
        }, 150);
      },

      add(name) {
        const id = makeId();
        const meta = {
          id,
          name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : 'Profile ' + (this.items.length + 1),
          tagline: '',
          color: DEFAULT_SETTINGS.accent,
          avatar: '',
          createdAt: Date.now()
        };
        this.items.push(meta);
        this.data[id] = defaultProfileData();
        this.persist(true);
        return meta;
      },

      remove(id) {
        if (this.items.length <= 1) return false;
        if (!this.data[id]) return false;
        this.items = this.items.filter(i => i.id !== id);
        delete this.data[id];
        if (this.activeId === id) this.activeId = this.items[0].id;
        this.persist(true);
        return true;
      },

      update(id, patch) {
        const meta = this.items.find(i => i.id === id);
        if (!meta || !patch || typeof patch !== 'object') return null;
        if (typeof patch.name === 'string' && patch.name.trim()) meta.name = patch.name.trim().slice(0, 60);
        if (typeof patch.tagline === 'string') meta.tagline = patch.tagline.slice(0, 120);
        if (/^#[0-9a-f]{6}$/i.test(patch.color || '')) meta.color = patch.color;
        if (typeof patch.avatar === 'string') meta.avatar = patch.avatar;
        this.persist();
        return meta;
      },

      switchTo(id) {
        if (!this.data[id]) return false;
        this.activeId = id;
        this.persist(true);
        return true;
      }
    };
  }

  function applyActiveProfile() {
    const ps = M.profileStore;
    if (!ps.data[ps.activeId]) ps.data[ps.activeId] = defaultProfileData();
    const data = ps.data[ps.activeId];
    DATA_KEYS.forEach(key => {
      M.state[key] = data[key];
    });
    M.state.activeGroup = 'All';
  }

  M.defaults = {
    settings: DEFAULT_SETTINGS,
    shortcuts: DEFAULT_SHORTCUTS,
    bookmarks: [],
    history: [],
    closedTabs: [],
    openTabs: { tabs: [], active: null },
    notes: '',
    todos: [],
    weather: { lat: null, lon: null, city: '' },
    focus: false
  };

  M.state = {};
  M.profileStore = null;

  M.loadState = async function () {
    await M.store.load();
    const raw = M.store.get('profiles', null);
    const profiles = raw && Array.isArray(raw.items) && raw.data && typeof raw.data === 'object'
      ? normalizeProfiles(raw)
      : migrateFlat();
    M.profileStore = createProfileStore(profiles);
    applyActiveProfile();
    M.profileStore.persist();
  };

  M.save = key => {
    if (!DATA_KEYS.includes(key)) return;
    const ps = M.profileStore;
    if (!ps || !ps.data[ps.activeId]) return;
    ps.data[ps.activeId][key] = M.state[key];
    ps.persist();
  };
  M.saveSettings = () => M.save('settings');

  window.addEventListener('beforeunload', () => {
    if (M.profileStore) M.profileStore.persist(true);
  });

  M.currentEngine = function () {
    const s = M.state.settings;
    return s.engines.find(e => e.name === s.defaultEngine) || s.engines[0];
  };

  M.formatBinding = function (e) {
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');
    let key = e.key;
    if (key === ' ') key = 'Space';
    else if (key.length === 1) key = key.toUpperCase();
    if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) parts.push(key);
    return parts.join('+');
  };

  M.matchBinding = function (e, binding) {
    if (!binding) return false;
    const parts = binding.split('+');
    const key = parts.pop();
    const needCtrl = parts.includes('Ctrl');
    const needAlt = parts.includes('Alt');
    const needShift = parts.includes('Shift');
    const needMeta = parts.includes('Meta');
    if (!!e.ctrlKey !== needCtrl) return false;
    if (!!e.altKey !== needAlt) return false;
    if (!!e.shiftKey !== needShift) return false;
    if (!!e.metaKey !== needMeta) return false;
    let k = e.key;
    if (k === ' ') k = 'Space';
    if (k.length === 1) k = k.toUpperCase();
    return k.toLowerCase() === key.toLowerCase();
  };
})();
