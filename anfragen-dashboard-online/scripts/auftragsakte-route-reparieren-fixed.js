const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');
const packagePath = path.join(root, 'package.json');

function fail(message) {
  console.error('❌ ' + message);
  process.exit(1);
}

if (!fs.existsSync(serverPath)) fail('server.js nicht gefunden. Bitte Script im Projektordner ausführen.');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const serverBackup = `${serverPath}.backup-before-archive-route-fixed-${stamp}`;
fs.copyFileSync(serverPath, serverBackup);
console.log('Backup erstellt:', path.basename(serverBackup));

let server = fs.readFileSync(serverPath, 'utf8');

function ensureRequire(source, name, statement) {
  if (source.includes(statement) || source.includes(`require('${name}')`) || source.includes(`require("${name}")`)) return source;
  const firstRequire = source.match(/^(const|let|var)\s+[^\n]+require\([^\n]+\);/m);
  if (firstRequire) return source.replace(firstRequire[0], `${firstRequire[0]}\n${statement}`);
  return `${statement}\n${source}`;
}

server = ensureRequire(server, 'archiver', "const archiver = require('archiver');");

const routeMarker = "/admin/requests/:id/archive.zip";
const archiveRoute = "\n\n// Auftragsakte als ZIP herunterladen\napp.get('/admin/requests/:id/archive.zip', requireLogin, async (req, res) => {\n  try {\n    const requestId = String(req.params.id || '');\n    const anfragen = await readAnfragen();\n    const auftrag = anfragen.find((item) => String(item.id) === requestId);\n\n    if (!auftrag) {\n      return res.status(404).send('Auftrag nicht gefunden.');\n    }\n\n    const safe = (value = '') => String(value || '')\n      .replace(/[\\\\/:*?\"<>|]+/g, '-')\n      .replace(/\\s+/g, '-')\n      .replace(/-+/g, '-')\n      .replace(/^-|-$/g, '')\n      .slice(0, 90) || 'auftrag';\n\n    const text = (value) => String(value == null || value === '' ? '-' : value);\n    const ticket = String(auftrag.id || '').slice(-6);\n    const name = safe(auftrag.name || 'kunde');\n    const date = new Date().toISOString().slice(0, 10);\n    const fileName = 'GW-' + date + '-' + ticket + '-' + name + '-Auftragsakte.zip';\n\n    res.setHeader('Content-Type', 'application/zip');\n    res.setHeader('Content-Disposition', 'attachment; filename=\"' + fileName + '\"');\n\n    const archive = archiver('zip', { zlib: { level: 9 } });\n    archive.on('error', (err) => {\n      console.error('[ARCHIVE] Fehler:', err);\n      if (!res.headersSent) res.status(500).send('Auftragsakte konnte nicht erstellt werden.');\n      else res.end();\n    });\n    archive.pipe(res);\n\n    const auftragsdaten = [\n      'GRÜNWERK AUFTRAGSAKTE',\n      '=====================',\n      '',\n      'Ticketnummer: #' + ticket,\n      'Auftrags-ID: ' + text(auftrag.id),\n      'Status: ' + text(auftrag.status),\n      'Datum: ' + text(auftrag.datum || auftrag.createdAt),\n      '',\n      'KUNDE',\n      '-----',\n      'Name: ' + text(auftrag.name),\n      'E-Mail: ' + text(auftrag.email),\n      'Telefon: ' + text(auftrag.telefon),\n      'Adresse: ' + text(auftrag.adresse || auftrag.ort),\n      '',\n      'AUFTRAG',\n      '-------',\n      'Leistung: ' + text(auftrag.kategorie || auftrag.leistung),\n      'Auftragsart: ' + text(auftrag.auftragsart),\n      'Grundstücksgröße: ' + text(auftrag.groesse),\n      'Zeitraum: ' + text(auftrag.zeitraum),\n      'Besichtigung: ' + text(auftrag.besichtigung),\n      'Erreichbarkeit: ' + text(auftrag.erreichbarkeit),\n      'Kontaktart: ' + text(auftrag.kontaktart),\n      'Zahlungswunsch: ' + text(auftrag.zahlungswunsch),\n      '',\n      'BESCHREIBUNG',\n      '------------',\n      text(auftrag.details || auftrag.nachricht || auftrag.message),\n      '',\n      'KALENDER',\n      '--------',\n      'Termin: ' + text(auftrag.calendarDate || auftrag.wunschDatum) + ' ' + text(auftrag.calendarTime || auftrag.wunschUhrzeit),\n      'Kalenderstatus: ' + text(auftrag.calendarStatusLabel || auftrag.calendarStatus),\n      'Kalendernotiz: ' + text(auftrag.calendarNote),\n      '',\n      'ZAHLUNG / RECHNUNG',\n      '------------------',\n      'Zahlungsart: ' + text(auftrag.invoicePaymentType || auftrag.paymentType || auftrag.zahlungsart),\n      'Zahlungsstatus: ' + text(auftrag.invoicePaymentStatus || auftrag.paymentStatus),\n      'Rechnung: ' + text(auftrag.invoiceNumber || auftrag.rechnungsnummer),\n      '',\n      'HINWEIS',\n      '-------',\n      'Diese Auftragsakte wurde automatisch aus dem GrünWerk Admin-Dashboard erstellt.'\n    ].join('\\n');\n\n    const kundenantworten = Array.isArray(auftrag.customerReplies || auftrag.kundenAntworten || auftrag.replies)\n      ? (auftrag.customerReplies || auftrag.kundenAntworten || auftrag.replies)\n      : [];\n\n    const notizen = Array.isArray(auftrag.internalNotes || auftrag.notizen || auftrag.notes)\n      ? (auftrag.internalNotes || auftrag.notizen || auftrag.notes)\n      : [];\n\n    const history = Array.isArray(auftrag.statusHistory || auftrag.statusVerlauf || auftrag.history)\n      ? (auftrag.statusHistory || auftrag.statusVerlauf || auftrag.history)\n      : [];\n\n    archive.append(auftragsdaten, { name: '01-Auftragsdaten.txt' });\n    archive.append(JSON.stringify(auftrag, null, 2), { name: '99-Rohdaten-Auftrag.json' });\n    archive.append(kundenantworten.length ? JSON.stringify(kundenantworten, null, 2) : 'Keine Kundenantworten vorhanden.', { name: '07-Kundenantworten.txt' });\n    archive.append(notizen.length ? JSON.stringify(notizen, null, 2) : 'Keine internen Notizen vorhanden.', { name: '06-Interne-Notizen.txt' });\n    archive.append(history.length ? JSON.stringify(history, null, 2) : 'Kein Statusverlauf vorhanden.', { name: '08-Statusverlauf.txt' });\n\n    const possiblePhotoArrays = [\n      ['03-Kundenfotos', auftrag.customerPhotos || auftrag.kundenFotos || auftrag.photos],\n      ['04-Vorher-Fotos', auftrag.beforePhotos || auftrag.vorherFotos],\n      ['05-Nachher-Fotos', auftrag.afterPhotos || auftrag.nachherFotos]\n    ];\n\n    function addFileIfExists(folder, value, index) {\n      if (!value) return false;\n      const raw = typeof value === 'string' ? value : (value.path || value.url || value.filename || value.file || '');\n      if (!raw || /^https?:\\/\\//i.test(raw)) return false;\n      const clean = String(raw).replace(/^\\/+/, '');\n      const fullPath = path.isAbsolute(clean) ? clean : path.join(process.cwd(), clean);\n      if (!fs.existsSync(fullPath)) return false;\n      const ext = path.extname(fullPath) || '.jpg';\n      const base = safe(value.originalname || value.name || path.basename(fullPath, ext) || ('foto-' + (index + 1)));\n      archive.file(fullPath, { name: folder + '/' + String(index + 1).padStart(2, '0') + '-' + base + ext });\n      return true;\n    }\n\n    possiblePhotoArrays.forEach(([folder, list]) => {\n      const arr = Array.isArray(list) ? list : (list ? [list] : []);\n      let added = 0;\n      arr.forEach((item, index) => {\n        if (addFileIfExists(folder, item, index)) added += 1;\n      });\n      if (!added) archive.append('Keine Dateien vorhanden oder Datei nicht mehr auf dem Server gespeichert.', { name: folder + '/README.txt' });\n    });\n\n    const invoicesDir = path.join(process.cwd(), 'data', 'invoices');\n    if (fs.existsSync(invoicesDir)) {\n      const invoiceFiles = fs.readdirSync(invoicesDir).filter((file) => file.includes(requestId) || file.includes(ticket));\n      if (invoiceFiles.length) {\n        invoiceFiles.forEach((file) => archive.file(path.join(invoicesDir, file), { name: '02-Rechnungen/' + file }));\n      } else {\n        archive.append('Keine gespeicherte Rechnung gefunden.', { name: '02-Rechnungen/README.txt' });\n      }\n    } else {\n      archive.append('Kein Rechnungsordner gefunden.', { name: '02-Rechnungen/README.txt' });\n    }\n\n    await archive.finalize();\n  } catch (error) {\n    console.error('[ARCHIVE] Route fehlgeschlagen:', error);\n    res.status(500).send('Auftragsakte konnte nicht erstellt werden: ' + error.message);\n  }\n});\n";

if (!server.includes(routeMarker)) {
  const listenIndex = server.lastIndexOf('app.listen');
  if (listenIndex === -1) fail('app.listen wurde in server.js nicht gefunden. Route konnte nicht eingefügt werden.');
  server = server.slice(0, listenIndex) + archiveRoute + '\n\n' + server.slice(listenIndex);
  console.log('Archiv-Route eingefügt.');
} else {
  console.log('Archiv-Route ist bereits vorhanden.');
}

fs.writeFileSync(serverPath, server);

if (fs.existsSync(packagePath)) {
  const pkgBackup = `${packagePath}.backup-before-archive-route-fixed-${stamp}`;
  fs.copyFileSync(packagePath, pkgBackup);
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.dependencies = pkg.dependencies || {};
  if (!pkg.dependencies.archiver) {
    pkg.dependencies.archiver = '^7.0.1';
    fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('archiver zu package.json hinzugefügt. Bitte danach npm install ausführen.');
  }
}

try {
  execSync('node -c server.js', { stdio: 'pipe' });
  console.log('✅ server.js Syntax ist gültig.');
  console.log('Fertig. Jetzt ausführen: npm install && git add . && git commit -m "Auftragsakte Route repariert" && git push');
} catch (error) {
  fs.copyFileSync(serverBackup, serverPath);
  console.error('❌ server.js hatte einen Syntaxfehler. Backup wurde automatisch zurückgesetzt.');
  console.error(String(error.stdout || error.stderr || error.message));
  process.exit(1);
}
