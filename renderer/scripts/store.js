(function () {
  const M = (window.Meru = window.Meru || {});
  const api = window.meru;
  const LS_KEY = 'meru-store';

  function readLocal() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  M.store = {
    data: {},

    async load() {
      if (api && api.storeAll) {
        try { this.data = (await api.storeAll()) || {}; } catch (e) { this.data = {}; }
      } else {
        this.data = readLocal();
      }
      return this.data;
    },

    get(key, def) {
      const v = this.data[key];
      return v === undefined ? def : v;
    },

    set(key, value) {
      this.data[key] = value;
      if (api && api.storeSet) {
        try { api.storeSet(key, value); } catch (e) {}
      } else {
        try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) {}
      }
    },

    replace(data) {
      this.data = data || {};
      if (!api) {
        try { localStorage.setItem(LS_KEY, JSON.stringify(this.data)); } catch (e) {}
      }
    },

    all() { return this.data; }
  };
})();
