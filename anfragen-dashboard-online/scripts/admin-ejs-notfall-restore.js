/*
  Notfall-Restore fuer views/admin.ejs
  - sucht nach Backup-Dateien von admin.ejs
  - prueft mit EJS, ob sie kompilierbar sind
  - stellt die neueste gueltige Backup-Datei wieder her
*/
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const viewsDir = path.join(root, 'views');
const adminPath = path.join(viewsDir, 'admin.ejs');

function log(msg) { console.log(msg); }
function fail(msg) { console.error('\n❌ ' + msg); process.exit(1); }

if (!fs.existsSync(viewsDir)) fail('Ordner views wurde nicht gefunden. Bitte Script im Projektordner ausfuehren.');
if (!fs.existsSync(adminPath)) fail('views/admin.ejs wurde nicht gefunden.');

let ejs;
try {
  ejs = require('ejs');
} catch (err) {
  fail('Paket ejs konnte nicht geladen werden. Bitte zuerst npm install ausfuehren.');
}

function canCompile(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    ejs.compile(content, { filename: file, async: false });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

const currentCheck = canCompile(adminPath);
if (currentCheck.ok) {
  log('✅ views/admin.ejs ist bereits gueltig. Es muss nichts wiederhergestellt werden.');
  process.exit(0);
}

log('⚠️  Aktuelle views/admin.ejs ist fehlerhaft:');
log(currentCheck.error);

const backups = fs.readdirSync(viewsDir)
  .filter(name => name.startsWith('admin.ejs.backup') || name.includes('admin.ejs.backup'))
  .map(name => {
    const full = path.join(viewsDir, name);
    const stat = fs.statSync(full);
    return { name, full, mtimeMs: stat.mtimeMs };
  })
  .sort((a, b) => b.mtimeMs - a.mtimeMs);

if (!backups.length) {
  fail('Keine admin.ejs Backup-Dateien gefunden. Lade mir dann bitte den Projektordner erneut als ZIP hoch.');
}

log('\nGefundene Backups:');
backups.forEach((b, i) => log(`${i + 1}. ${b.name}`));

const restoreBackupOfBroken = path.join(viewsDir, `admin.ejs.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.copyFileSync(adminPath, restoreBackupOfBroken);
log(`\nKaputte Datei gesichert als: ${path.basename(restoreBackupOfBroken)}`);

for (const backup of backups) {
  const check = canCompile(backup.full);
  if (!check.ok) {
    log(`Überspringe fehlerhaftes Backup: ${backup.name}`);
    continue;
  }

  fs.copyFileSync(backup.full, adminPath);
  const finalCheck = canCompile(adminPath);
  if (finalCheck.ok) {
    log(`\n✅ Wiederhergestellt aus: ${backup.name}`);
    log('✅ views/admin.ejs kompiliert wieder sauber.');
    log('\nJetzt ausfuehren:');
    log('git add .');
    log('git commit -m "Admin Dashboard Notfall Restore"');
    log('git push');
    process.exit(0);
  }
}

fail('Kein gueltiges Backup gefunden. Bitte Projektordner als ZIP hochladen, dann repariere ich admin.ejs direkt.');
