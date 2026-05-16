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
const serverBackup = `${serverPath}.backup-before-archive-route-${stamp}`;
fs.copyFileSync(serverPath, serverBackup);
console.log('Backup erstellt:', path.basename(serverBackup));

let server = fs.readFileSync(serverPath, 'utf8');

function ensureRequire(source, name, statement) {
  if (source.includes(statement) || source.includes(`require('${name}')`) || source.includes(`require("${name}")`)) return source;
  const firstRequire = source.match(/^(const|let|var)\s+[^\n]+require\([^\n]+\);/m);
  if (firstRequire) {
    return source.replace(firstRequire[0], `${firstRequire[0]}\n${statement}`);
  }
  return `${statement}\n${source}`;
}

server = ensureRequire(server, 'archiver', "const archiver = require('archiver');");

const routeMarker = "/admin/requests/:id/archive.zip";
if (!server.includes(routeMarker)) {
  const archiveRoute = String.raw`

// Auftragsakte als ZIP herunterladen
app.get('/admin/requests/:id/archive.zip', requireLogin, async (req, res) => {
  try {
    const requestId = String(req.params.id || '');
    const anfragen = await readAnfragen();
    const auftrag = anfragen.find((item) => String(item.id) === requestId);

    if (!auftrag) {
      return res.status(404).send('Auftrag nicht gefunden.');
    }

    const safe = (value = '') => String(value || '')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90) || 'auftrag';

    const text = (value) => String(value == null || value === '' ? '-' : value);
    const ticket = String(auftrag.id || '').slice(-6);
    const name = safe(auftrag.name || 'kunde');
    const date = new Date().toISOString().slice(0, 10);
    const fileName = `GW-${date}-${ticket}-${name}-Auftragsakte.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', (err) => {
      console.error('[ARCHIVE] Fehler:', err);
      if (!res.headersSent) res.status(500).send('Auftragsakte konnte nicht erstellt werden.');
      else res.end();
    });
    archive.pipe(res);

    const auftragsdaten = [
      'GRÜNWERK AUFTRAGSAKTE',
      '=====================',
      '',
      `Ticketnummer: #${ticket}`,
      `Auftrags-ID: ${text(auftrag.id)}`,
      `Status: ${text(auftrag.status)}`,
      `Datum: ${text(auftrag.datum || auftrag.createdAt)}`,
      '',
      'KUNDE',
      '-----',
      `Name: ${text(auftrag.name)}`,
      `E-Mail: ${text(auftrag.email)}`,
      `Telefon: ${text(auftrag.telefon)}`,
      `Adresse: ${text(auftrag.adresse || auftrag.ort)}`,
      '',
      'AUFTRAG',
      '-------',
      `Leistung: ${text(auftrag.kategorie || auftrag.leistung)}`,
      `Auftragsart: ${text(auftrag.auftragsart)}`,
      `Grundstücksgröße: ${text(auftrag.groesse)}`,
      `Zeitraum: ${text(auftrag.zeitraum)}`,
      `Besichtigung: ${text(auftrag.besichtigung)}`,
      `Erreichbarkeit: ${text(auftrag.erreichbarkeit)}`,
      `Kontaktart: ${text(auftrag.kontaktart)}`,
      `Zahlungswunsch: ${text(auftrag.zahlungswunsch)}`,
      '',
      'BESCHREIBUNG',
      '------------',
      text(auftrag.details || auftrag.nachricht || auftrag.message),
      '',
      'KALENDER',
      '--------',
      `Termin: ${text(auftrag.calendarDate || auftrag.wunschDatum)} ${text(auftrag.calendarTime || auftrag.wunschUhrzeit)}`,
      `Kalenderstatus: ${text(auftrag.calendarStatusLabel || auftrag.calendarStatus)}`,
      `Kalendernotiz: ${text(auftrag.calendarNote)}`,
      '',
      'ZAHLUNG / RECHNUNG',
      '------------------',
      `Zahlungsart: ${text(auftrag.invoicePaymentType || auftrag.paymentType || auftrag.zahlungsart)}`,
      `Zahlungsstatus: ${text(auftrag.invoicePaymentStatus || auftrag.paymentStatus)}`,
      `Rechnung: ${text(auftrag.invoiceNumber || auftrag.rechnungsnummer)}`,
      '',
      'HINWEIS',
      '-------',
      'Diese Auftragsakte wurde automatisch aus dem GrünWerk Admin-Dashboard erstellt.'
    ].join('\n');

    const kundenantworten = Array.isArray(auftrag.customerReplies || auftrag.kundenAntworten || auftrag.replies)
      ? (auftrag.customerReplies || auftrag.kundenAntworten || auftrag.replies)
      : [];

    const notizen = Array.isArray(auftrag.internalNotes || auftrag.notizen || auftrag.notes)
      ? (auftrag.internalNotes || auftrag.notizen || auftrag.notes)
      : [];

    const history = Array.isArray(auftrag.statusHistory || auftrag.statusVerlauf || auftrag.history)
      ? (auftrag.statusHistory || auftrag.statusVerlauf || auftrag.history)
      : [];

    archive.append(auftragsdaten, { name: '01-Auftragsdaten.txt' });
    archive.append(JSON.stringify(auftrag, null, 2), { name: '99-Rohdaten-Auftrag.json' });
    archive.append(kundenantworten.length ? JSON.stringify(kundenantworten, null, 2) : 'Keine Kundenantworten vorhanden.', { name: '07-Kundenantworten.txt' });
    archive.append(notizen.length ? JSON.stringify(notizen, null, 2) : 'Keine internen Notizen vorhanden.', { name: '06-Interne-Notizen.txt' });
    archive.append(history.length ? JSON.stringify(history, null, 2) : 'Kein Statusverlauf vorhanden.', { name: '08-Statusverlauf.txt' });

    const possiblePhotoArrays = [
      ['03-Kundenfotos', auftrag.customerPhotos || auftrag.kundenFotos || auftrag.photos],
      ['04-Vorher-Fotos', auftrag.beforePhotos || auftrag.vorherFotos],
      ['05-Nachher-Fotos', auftrag.afterPhotos || auftrag.nachherFotos]
    ];

    function addFileIfExists(folder, value, index) {
      if (!value) return false;
      const raw = typeof value === 'string' ? value : (value.path || value.url || value.filename || value.file || '');
      if (!raw || /^https?:\/\//i.test(raw)) return false;
      const clean = String(raw).replace(/^\/+/, '');
      const fullPath = path.isAbsolute(clean) ? clean : path.join(__dirname, clean);
      if (!fs.existsSync(fullPath)) return false;
      const ext = path.extname(fullPath) || '.jpg';
      const base = safe(value.originalname || value.name || path.basename(fullPath, ext) || `foto-${index + 1}`);
      archive.file(fullPath, { name: `${folder}/${String(index + 1).padStart(2, '0')}-${base}${ext}` });
      return true;
    }

    possiblePhotoArrays.forEach(([folder, list]) => {
      const arr = Array.isArray(list) ? list : (list ? [list] : []);
      let added = 0;
      arr.forEach((item, index) => {
        if (addFileIfExists(folder, item, index)) added += 1;
      });
      if (!added) archive.append('Keine Dateien vorhanden oder Datei nicht mehr auf dem Server gespeichert.', { name: `${folder}/README.txt` });
    });

    const invoicesDir = path.join(__dirname, 'data', 'invoices');
    if (fs.existsSync(invoicesDir)) {
      const invoiceFiles = fs.readdirSync(invoicesDir).filter((file) => file.includes(requestId) || file.includes(ticket));
      if (invoiceFiles.length) {
        invoiceFiles.forEach((file) => archive.file(path.join(invoicesDir, file), { name: `02-Rechnungen/${file}` }));
      } else {
        archive.append('Keine gespeicherte Rechnung gefunden.', { name: '02-Rechnungen/README.txt' });
      }
    } else {
      archive.append('Kein Rechnungsordner gefunden.', { name: '02-Rechnungen/README.txt' });
    }

    await archive.finalize();
  } catch (error) {
    console.error('[ARCHIVE] Route fehlgeschlagen:', error);
    res.status(500).send('Auftragsakte konnte nicht erstellt werden: ' + error.message);
  }
});
`;

  const listenIndex = server.lastIndexOf('app.listen');
  if (listenIndex === -1) fail('app.listen wurde in server.js nicht gefunden. Route konnte nicht eingefügt werden.');
  server = server.slice(0, listenIndex) + archiveRoute + '\n\n' + server.slice(listenIndex);
  console.log('Archiv-Route eingefügt.');
} else {
  console.log('Archiv-Route ist bereits vorhanden.');
}

fs.writeFileSync(serverPath, server);

if (fs.existsSync(packagePath)) {
  const pkgBackup = `${packagePath}.backup-before-archive-route-${stamp}`;
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
