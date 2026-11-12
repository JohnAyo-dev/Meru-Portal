const fs = require('fs');
const path = require('path');

const CURRENT_VERSION = 2;
const MAX_VALUE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_BYTES = MAX_VALUE_BYTES * 4;

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function jsonSize(value) {
  try {
    const text = JSON.stringify(value);
    return text === undefined ? 0 : Buffer.byteLength(text, 'utf8');
  } catch (e) {
    return Infinity;
  }
}

class Store {
  constructor(dir, options) {
    options = options || {};
    this.dir = dir;
    this.file = path.join(dir, 'meru-data.json');
    this.backup = path.join(dir, 'meru-data.backup.json');
    this.preImportFile = path.join(dir, 'meru-data.pre-import.json');
    this.logger = options.logger || null;
    this.data = {};
    this.version = CURRENT_VERSION;
    this.timer = null;
    this.loadStatus = { loaded: 'empty', recovered: false, quarantined: [] };
    this.load();
  }

  log(level, message) {
    if (this.logger && typeof this.logger[level] === 'function') this.logger[level](message);
    else if (level === 'error') console.error('[store] ' + message);
  }

  parse(file) {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isPlainObject(parsed)) throw new Error('Store is not an object');
    if (!isPlainObject(parsed.data)) throw new Error('Store data is not an object');
    return { version: Number(parsed.version) || 1, data: parsed.data };
  }

  quarantine(file, label) {
    try {
      if (!fs.existsSync(file)) return;
      const dest = file + '.corrupt-' + Date.now();
      fs.renameSync(file, dest);
      this.loadStatus.quarantined.push(dest);
      this.log('warn', 'Quarantined unreadable ' + label + ' store to ' + path.basename(dest));
    } catch (e) {
      this.log('error', 'Could not quarantine ' + label + ' store: ' + (e && e.message));
    }
  }

  load() {
    let primary = null;
    try {
      primary = this.parse(this.file);
    } catch (e) {}

    if (primary) {
      this.version = primary.version;
      this.data = primary.data;
      this.migrate();
      this.loadStatus.loaded = 'primary';
      return;
    }

    let backup = null;
    try {
      backup = this.parse(this.backup);
    } catch (e) {}

    if (backup) {
      this.version = backup.version;
      this.data = backup.data;
      this.migrate();
      this.loadStatus.loaded = 'backup';
      this.loadStatus.recovered = true;
      this.log('warn', 'Primary store unreadable; recovered from backup.');
      this.quarantine(this.file, 'primary');
      this.write();
      return;
    }

    if (fs.existsSync(this.file) || fs.existsSync(this.backup)) {
      this.loadStatus.recovered = true;
      this.log('error', 'Both store files are unreadable; starting with empty data.');
      this.quarantine(this.file, 'primary');
      this.quarantine(this.backup, 'backup');
    }

    this.data = {};
    this.version = CURRENT_VERSION;
    this.loadStatus.loaded = 'empty';
  }

  migrate() {
    // v1 used localStorage and had no version. Keep whatever is here and stamp it.
    if (this.version < 2) this.version = 2;
  }

  writeFileAtomic(file, text) {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, text, 'utf8');
      try {
        fs.fsyncSync(fd);
      } catch (e) {}
    } finally {
      try {
        fs.closeSync(fd);
      } catch (e) {}
    }
    fs.renameSync(tmp, file);
  }

  write() {
    try {
      const payload = JSON.stringify({ version: this.version, data: this.data }, null, 2);
      if (fs.existsSync(this.file)) {
        try {
          fs.copyFileSync(this.file, this.backup);
        } catch (e) {
          this.log('warn', 'Backup copy failed: ' + (e && e.message));
        }
      }
      this.writeFileAtomic(this.file, payload);
    } catch (e) {
      this.log('error', 'Store write failed: ' + (e && e.message));
    }
  }

  get(key, def) {
    return this.data[key] === undefined ? def : this.data[key];
  }

  set(key, value) {
    if (typeof key !== 'string' || !key || key.length > 200) throw new Error('Invalid store key');
    if (jsonSize(value) > MAX_VALUE_BYTES) throw new Error('Store value is too large');
    this.data[key] = value;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.write(), 120);
  }

  all() {
    return this.data;
  }

  reset() {
    this.data = {};
    this.version = CURRENT_VERSION;
    this.write();
  }

  import(data) {
    if (!isPlainObject(data)) throw new Error('Invalid data');
    if (jsonSize(data) > MAX_IMPORT_BYTES) throw new Error('Backup is too large');
    try {
      const snapshot = JSON.stringify({ version: this.version, data: this.data }, null, 2);
      this.writeFileAtomic(this.preImportFile, snapshot);
    } catch (e) {
      this.log('warn', 'Could not write pre-import snapshot: ' + (e && e.message));
    }
    this.data = data;
    this.version = CURRENT_VERSION;
    this.write();
  }

  getStatus() {
    return {
      loaded: this.loadStatus.loaded,
      recovered: this.loadStatus.recovered,
      quarantined: this.loadStatus.quarantined.slice()
    };
  }

  flush() {
    clearTimeout(this.timer);
    this.write();
  }
}

module.exports = { Store, CURRENT_VERSION };
