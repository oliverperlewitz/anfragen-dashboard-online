const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('❌ server.js wurde nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

const original = fs.readFileSync(serverPath, 'utf8');
const backupPath = path.join(root, `server.js.backup-before-archive-filename-date-${Date.now()}`);
fs.writeFileSync(backupPath, original);
console.log('✅ Backup erstellt:', path.basename(backupPath));

if (original.includes('archiveDownloadDate') && original.includes('Download-${archiveDownloadDate}')) {
  console.log('ℹ️ Dateiname enthält Download-Datum bereits. Keine Änderung nötig.');
  process.exit(0);
}

let updated = original;

const routeMarker = "/admin/requests/:id/archive.zip";
if (!updated.includes(routeMarker)) {
  console.error('❌ Auftragsakte-Route wurde nicht gefunden. Bitte zuerst das Auftragsakte-Feature einbauen/reparieren.');
  process.exit(1);
}

// Häufige Variante aus dem Auftragsakte-Script:
// const filename = `GW-${date}-${ticket}-${fname}-Auftragsakte.zip`;
const exactPatterns = [
  /const filename = `GW-\$\{date\}-\$\{ticket\}-\$\{fname\}-Auftragsakte\.zip`;?/,
  /const filename = `GW-\$\{year\}-\$\{ticket\}-\$\{fname\}-Auftragsakte\.zip`;?/,
  /const filename = `GW-\$\{date\}-\$\{ticket\}-\$\{safeName\}-Auftragsakte\.zip`;?/,
  /const filename = `GW-\$\{year\}-\$\{ticket\}-\$\{safeName\}-Auftragsakte\.zip`;?/
];

let replaced = false;
for (const pattern of exactPatterns) {
  if (pattern.test(updated)) {
    updated = updated.replace(pattern, (match) => {
      const nameVar = match.includes('${safeName}') ? 'safeName' : 'fname';
      const firstVar = match.includes('${year}') ? 'year' : 'date';
      return `const archiveDownloadDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());\n  const filename = \`GW-\${${firstVar}}-\${ticket}-Download-\${archiveDownloadDate}-\${${nameVar}}-Auftragsakte.zip\`;`;
    });
    replaced = true;
    break;
  }
}

// Fallback: innerhalb der Route nach einer filename-Zeile mit Auftragsakte.zip suchen
if (!replaced) {
  const routeIndex = updated.indexOf(routeMarker);
  const before = updated.slice(0, routeIndex);
  const after = updated.slice(routeIndex);
  const routeEnd = after.indexOf('\n});');
  if (routeEnd === -1) {
    console.error('❌ Konnte das Ende der Auftragsakte-Route nicht sicher erkennen. Keine Änderung gemacht.');
    process.exit(1);
  }
  const routeBlock = after.slice(0, routeEnd + 5);
  const filenameLineMatch = routeBlock.match(/const filename = `([^`]*Auftragsakte\.zip)`;?/);
  if (!filenameLineMatch) {
    console.error('❌ Konnte die Dateiname-Zeile in der Auftragsakte-Route nicht finden.');
    process.exit(1);
  }

  let newTemplate = filenameLineMatch[1];
  if (!newTemplate.includes('Download-${archiveDownloadDate}')) {
    newTemplate = newTemplate.replace('-Auftragsakte.zip', '-Download-${archiveDownloadDate}-Auftragsakte.zip');
  }

  const newLine = `const archiveDownloadDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());\n  const filename = \`${newTemplate}\`;`;
  const newRouteBlock = routeBlock.replace(/const filename = `[^`]*Auftragsakte\.zip`;?/, newLine);
  updated = before + after.replace(routeBlock, newRouteBlock);
  replaced = true;
}

fs.writeFileSync(serverPath, updated);

try {
  execSync('node -c server.js', { stdio: 'pipe' });
  console.log('✅ server.js Syntax ist gültig.');
  console.log('✅ Auftragsakte-Dateiname enthält jetzt das Download-Datum.');
  console.log('Beispiel: GW-2026-000017-Download-2026-05-17-Mila-Auftragsakte.zip');
} catch (error) {
  fs.writeFileSync(serverPath, original);
  console.error('❌ Syntaxfehler nach Änderung. Backup wurde automatisch zurückgespielt.');
  console.error(String(error.stdout || error.stderr || error.message));
  process.exit(1);
}
