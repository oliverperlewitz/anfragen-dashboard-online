const fs = require('fs');
const path = require('path');

const root = process.cwd();
const adminPath = path.join(root, 'views', 'admin.ejs');

function exists(p) { return fs.existsSync(p); }
function copy(src, dest) { fs.copyFileSync(src, dest); }
function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

if (!exists(adminPath)) {
  console.error('❌ views/admin.ejs nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

const backupCurrent = path.join(root, 'views', `admin.ejs.backup-current-broken-status-${nowStamp()}`);
copy(adminPath, backupCurrent);
console.log('✅ Aktuelle defekte admin.ejs wurde gesichert als:');
console.log('   ' + path.relative(root, backupCurrent));

const candidates = [
  'admin.ejs.backup-before-status-stack-final',
  'admin.ejs.backup-before-statusbereich-wirklich-untereinander',
  'admin.ejs.backup-before-status-stack-force',
  'admin.ejs.backup-before-status-layout-vorlagen',
  'admin.ejs.backup-before-invoice-lite',
  'admin.ejs.backup-before-invoices-2026',
  'admin.ejs.backup-before-auftragsakte-button',
  'admin.ejs.backup-before-auftragsakte',
].map(name => path.join(root, 'views', name));

let chosen = candidates.find(exists);

if (!chosen) {
  const all = fs.readdirSync(path.join(root, 'views'))
    .filter(name => name.startsWith('admin.ejs.backup'))
    .map(name => ({ name, full: path.join(root, 'views', name), mtime: fs.statSync(path.join(root, 'views', name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  chosen = all.length ? all[0].full : null;
}

if (!chosen) {
  console.error('❌ Keine admin.ejs Backup-Datei gefunden.');
  console.error('Bitte sag mir dann Bescheid, dann bauen wir ein manuelles Restore.');
  process.exit(1);
}

copy(chosen, adminPath);
console.log('✅ Wiederhergestellt aus Backup:');
console.log('   ' + path.relative(root, chosen));

let restored = fs.readFileSync(adminPath, 'utf8');
const badRefs = [
  /\s*<link rel="stylesheet" href="\/status-stack-final\.css">\s*/g,
  /\s*<script src="\/status-stack-final\.js" defer><\/script>\s*/g,
  /\s*<link rel="stylesheet" href="\/status-stack-force\.css">\s*/g,
  /\s*<script src="\/status-stack-force\.js" defer><\/script>\s*/g,
];
for (const rx of badRefs) restored = restored.replace(rx, '\n');
fs.writeFileSync(adminPath, restored);
console.log('✅ Kaputte Status-Final/Force-Einbindungen entfernt, falls vorhanden.');

try {
  // Quick sanity: EJS is not compiled here, but ensure file isn't empty and contains dashboard marker.
  const finalText = fs.readFileSync(adminPath, 'utf8');
  if (!finalText.includes('Dashboard') && !finalText.includes('Anfragen')) {
    throw new Error('admin.ejs sieht ungewöhnlich aus.');
  }
  console.log('✅ Restore fertig. Jetzt git add/commit/push ausführen.');
} catch (error) {
  console.error('❌ Restore prüfen: ' + error.message);
  process.exit(1);
}
