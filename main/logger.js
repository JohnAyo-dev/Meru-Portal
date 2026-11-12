const fs = require('fs');
const path = require('path');

function formatArg(value) {
  if (value instanceof Error) return value.stack || (value.name + ': ' + value.message);
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

class Logger {
  constructor(dir, options) {
    options = options || {};
    this.dir = dir;
    this.file = path.join(dir, 'meru.log');
    this.maxBytes = options.maxBytes || 1024 * 1024;
    this.maxFiles = options.maxFiles || 5;
    this.ensureDir();
  }

  ensureDir() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
    } catch (e) {}
  }

  rotate() {
    try {
      if (!fs.existsSync(this.file)) return;
      if (fs.statSync(this.file).size < this.maxBytes) return;
      for (let i = this.maxFiles; i >= 1; i--) {
        const from = this.file + '.' + i;
        if (!fs.existsSync(from)) continue;
        if (i === this.maxFiles) fs.unlinkSync(from);
        else fs.renameSync(from, this.file + '.' + (i + 1));
      }
      fs.renameSync(this.file, this.file + '.1');
    } catch (e) {}
  }

  write(level, args) {
    this.ensureDir();
    this.rotate();
    const line = '[' + new Date().toISOString() + '] [' + level + '] ' + args.map(formatArg).join(' ') + '\n';
    try {
      fs.appendFileSync(this.file, line, 'utf8');
    } catch (e) {}
  }

  info() {
    this.write('info', Array.prototype.slice.call(arguments));
  }

  warn() {
    this.write('warn', Array.prototype.slice.call(arguments));
  }

  error() {
    this.write('error', Array.prototype.slice.call(arguments));
  }
}

module.exports = { Logger };
