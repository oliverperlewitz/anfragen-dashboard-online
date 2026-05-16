const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = ['server.js', 'views/admin.ejs', 'public/style.css', 'package.json'];

function newestBackupFor(file) {
  const dir = path.dirname(path.join(root, file));
  const base = path.basename(file);
  if (!fs.existsSync(dir)) return null;
  const backups = fs.readdirSync(dir)
    .filter(name => name.startsWith(base + '.backup-before-invoices-'))
    .map(name => path.join(dir, name))
    .filter(full => fs.statSync(full).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return backups[0] || null;
}

let restored = 0;
for (const file of files) {
  const backup = newestBackupFor(file);
  if (!backup) {
    console.log(`Kein Rechnungs-Backup gefunden für ${file} — übersprungen.`);
    continue;
  }
  const target = path.join(root, file);
  fs.copyFileSync(backup, target);
  console.log(`Wiederhergestellt: ${file} <- ${path.relative(root, backup)}`);
  restored += 1;
}

if (!restored) {
  console.log('\nKeine Backups gefunden. Dann bitte Render-Rollback benutzen oder server.js manuell aus GitHub vor dem Rechnungs-Commit zurücksetzen.');
  process.exitCode = 1;
} else {
  console.log('\nFertig. Jetzt ausführen:');
  console.log('git add .');
  console.log('git commit -m "Rechnungsfehler zurueckgesetzt"');
  console.log('git push');
}
