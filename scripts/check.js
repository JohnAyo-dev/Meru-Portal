const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsFiles = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) jsFiles.push(full);
  }
}

['main', 'renderer', 'scripts'].forEach(dir => walk(path.join(root, dir)));

let failures = 0;

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    failures++;
    console.error('Syntax error in ' + path.relative(root, file));
    console.error(String(err.stderr || err.message));
  }
}

const htmlPath = path.join(root, 'renderer', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const ids = new Set();
const duplicates = new Set();
for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
  if (ids.has(match[1])) duplicates.add(match[1]);
  ids.add(match[1]);
}
for (const id of duplicates) {
  failures++;
  console.error('Duplicate element id: ' + id);
}

const rendererScripts = jsFiles.filter(f => f.startsWith(path.join(root, 'renderer')));
const missing = new Map();
for (const file of rendererScripts) {
  const src = fs.readFileSync(file, 'utf8');
  for (const match of src.matchAll(/\$\(\s*['"]#([\w-]+)['"]\s*\)/g)) {
    const id = match[1];
    if (!ids.has(id)) {
      if (!missing.has(id)) missing.set(id, []);
      missing.get(id).push(path.relative(root, file));
    }
  }
}
for (const [id, files] of missing) {
  failures++;
  console.error('Missing element #' + id + ' referenced by ' + files.join(', '));
}

const closeTargets = [...html.matchAll(/data-close="([^"]+)"/g)].map(m => m[1]);
for (const id of closeTargets) {
  if (!ids.has(id)) {
    failures++;
    console.error('data-close points at missing element #' + id);
  }
}

if (failures) {
  console.error('\n' + failures + ' check(s) failed.');
  process.exit(1);
}

console.log('Checked ' + jsFiles.length + ' JavaScript files and ' + ids.size + ' element ids. All good.');
