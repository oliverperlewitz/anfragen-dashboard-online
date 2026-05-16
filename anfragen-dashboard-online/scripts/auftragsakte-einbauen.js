const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');
const adminPath = path.join(root, 'views', 'admin.ejs');
const cssPath = path.join(root, 'public', 'style.css');
const packagePath = path.join(root, 'package.json');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function backup(filePath, label) {
  if (!fs.existsSync(filePath)) return;
  const backupPath = `${filePath}.backup-before-${label}-${stamp}`;
  fs.copyFileSync(filePath, backupPath);
  console.log(`Backup erstellt: ${path.relative(root, backupPath)}`);
}

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`${path.relative(root, filePath)} nicht gefunden.`);
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function ensureRequire(source, moduleName, variableName) {
  const re = new RegExp(`(?:const|let|var)\\s+${variableName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*=\\s*require\\(['\"]${moduleName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}['\"]\\)`);
  if (re.test(source)) return source;
  const lines = source.split('\n');
  let insertAt = 0;
  for (let i = 0; i < Math.min(lines.length, 80); i++) {
    if (/^\s*(const|let|var)\s+.+require\(/.test(lines[i])) insertAt = i + 1;
  }
  lines.splice(insertAt, 0, `const ${variableName} = require('${moduleName}');`);
  return lines.join('\n');
}

function addDependencies() {
  if (!fs.existsSync(packagePath)) return;
  backup(packagePath, 'auftrag-archive');
  const pkg = JSON.parse(read(packagePath));
  pkg.dependencies = pkg.dependencies || {};
  if (!pkg.dependencies.archiver) pkg.dependencies.archiver = '^7.0.1';
  if (!pkg.dependencies.pdfkit) pkg.dependencies.pdfkit = '^0.15.2';
  write(packagePath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('package.json aktualisiert: archiver + pdfkit');
}

const serverBlock = String.raw`

// GrünWerk Auftragsakte / Nachweis-ZIP
function gwArchiveSafeText(value, fallback = '-') {
  const text = value === undefined || value === null ? '' : String(value);
  return text.trim() || fallback;
}

function gwArchiveCleanFileName(value) {
  return gwArchiveSafeText(value, 'datei')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function gwArchiveTicket(anfrage) {
  return String((anfrage && anfrage.id) || '').slice(-6) || 'auftrag';
}

function gwArchiveDateLabel(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' });
}

function gwArchiveGet(anfrage, keys) {
  for (const key of keys) {
    if (anfrage && anfrage[key] !== undefined && anfrage[key] !== null && String(anfrage[key]).trim() !== '') return anfrage[key];
  }
  return '';
}

function gwArchiveLinesFromObject(obj, prefix = '') {
  const lines = [];
  if (!obj || typeof obj !== 'object') return lines;
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    if (['photos', 'customerPhotos', 'beforePhotos', 'afterPhotos', 'images', 'files', 'attachments'].includes(key)) continue;
    if (Array.isArray(value)) continue;
    if (typeof value === 'object') continue;
    lines.push(`${prefix}${key}: ${String(value)}`);
  }
  return lines;
}

function gwArchivePdfBuffer(title, sections = []) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 46, size: 'A4', info: { Title: title } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#123b25';
    const muted = '#5f705f';
    let y = 46;

    doc.fillColor(green).font('Helvetica-Bold').fontSize(20).text('GrünWerk Gartenbau', 46, y);
    doc.font('Helvetica').fontSize(9).fillColor(muted).text('Auftragsakte / Nachweis', 46, y + 24);
    doc.moveTo(46, y + 44).lineTo(549, y + 44).strokeColor(green).lineWidth(1.5).stroke();
    y += 66;

    doc.fillColor(green).font('Helvetica-Bold').fontSize(16).text(title, 46, y);
    y += 28;

    for (const section of sections) {
      if (y > 720) { doc.addPage(); y = 46; }
      doc.fillColor(green).font('Helvetica-Bold').fontSize(12).text(section.heading || 'Abschnitt', 46, y);
      y += 17;
      const lines = Array.isArray(section.lines) ? section.lines : [String(section.text || '')];
      doc.fillColor('#1c2f22').font('Helvetica').fontSize(10);
      for (const line of lines) {
        const clean = gwArchiveSafeText(line, '');
        if (!clean) continue;
        const height = doc.heightOfString(clean, { width: 500 });
        if (y + height > 760) { doc.addPage(); y = 46; }
        doc.text(clean, 46, y, { width: 500 });
        y += height + 5;
      }
      y += 12;
    }

    doc.fillColor(muted).fontSize(8).text('Automatisch erstellt aus dem GrünWerk Admin Dashboard.', 46, 790, { width: 500, align: 'center' });
    doc.end();
  });
}

function gwArchiveResolveFile(file) {
  if (!file) return null;
  const rawPath = gwArchiveSafeText(file.path || file.filePath || file.url || file.href || file.src || file.location || '', '');
  const name = gwArchiveCleanFileName(file.originalname || file.originalName || file.filename || file.name || path.basename(rawPath) || 'foto');
  if (!rawPath) return null;
  const normalized = rawPath.split('?')[0].replace(/^https?:\/\/[^/]+/i, '');
  const candidates = [];
  if (path.isAbsolute(normalized)) candidates.push(normalized);
  candidates.push(path.join(__dirname, normalized.replace(/^\//, '')));
  candidates.push(path.join(__dirname, 'public', normalized.replace(/^\//, '')));
  candidates.push(path.join(__dirname, 'data', normalized.replace(/^\//, '')));
  candidates.push(path.join(process.cwd(), normalized.replace(/^\//, '')));
  for (const candidate of candidates) {
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return { path: candidate, name };
    } catch (_) {}
  }
  return null;
}

function gwArchiveCollectPhotos(value, parentKey = '', target = []) {
  if (!value) return target;
  if (Array.isArray(value)) {
    value.forEach(item => gwArchiveCollectPhotos(item, parentKey, target));
    return target;
  }
  if (typeof value !== 'object') return target;
  const maybeFile = gwArchiveResolveFile(value);
  if (maybeFile) {
    const key = parentKey.toLowerCase();
    let folder = '03-Kundenfotos';
    if (key.includes('before') || key.includes('vorher')) folder = '04-Vorher-Fotos';
    if (key.includes('after') || key.includes('nachher')) folder = '05-Nachher-Fotos';
    target.push({ ...maybeFile, folder });
  }
  for (const [key, item] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (lower.includes('photo') || lower.includes('foto') || lower.includes('image') || lower.includes('bild') || Array.isArray(item)) {
      gwArchiveCollectPhotos(item, key, target);
    }
  }
  return target;
}

function gwArchiveBuildMainPdfSections(anfrage) {
  const ticket = gwArchiveTicket(anfrage);
  return [
    { heading: 'Ticket', lines: [`Ticketnummer: #${ticket}`, `Interne ID: ${gwArchiveSafeText(anfrage.id)}`, `Status: ${gwArchiveSafeText(anfrage.status || 'Neu')}`, `Erstellt: ${gwArchiveSafeText(anfrage.datum || anfrage.createdAt || anfrage.created_at)}`] },
    { heading: 'Kunde', lines: [`Name: ${gwArchiveSafeText(anfrage.name)}`, `E-Mail: ${gwArchiveSafeText(anfrage.email)}`, `Telefon: ${gwArchiveSafeText(anfrage.telefon || anfrage.phone)}`, `Adresse: ${gwArchiveSafeText(anfrage.adresse || anfrage.address || anfrage.ort)}`] },
    { heading: 'Auftrag', lines: [`Leistung: ${gwArchiveSafeText(anfrage.kategorie || anfrage.leistung || anfrage.service)}`, `Auftragsart: ${gwArchiveSafeText(anfrage.auftragsart)}`, `Grundstücksgröße: ${gwArchiveSafeText(anfrage.groesse || anfrage.grundstuecksgroesse)}`, `Zeitraum: ${gwArchiveSafeText(anfrage.zeitraum)}`, `Besichtigung: ${gwArchiveSafeText(anfrage.besichtigung)}`, `Kontaktart: ${gwArchiveSafeText(anfrage.kontaktart)}`, `Zahlungswunsch: ${gwArchiveSafeText(anfrage.zahlungswunsch || anfrage.paymentPreference || anfrage.paymentWish)}`] },
    { heading: 'Beschreibung / Kundenwunsch', lines: [gwArchiveSafeText(anfrage.details || anfrage.nachricht || anfrage.message || anfrage.beschreibung)] },
    { heading: 'Kalender / Termin', lines: [`Datum: ${gwArchiveSafeText(anfrage.calendarDate || anfrage.wunschDatum)}`, `Uhrzeit: ${gwArchiveSafeText(anfrage.calendarTime || anfrage.wunschUhrzeit)}`, `Kalenderstatus: ${gwArchiveSafeText(anfrage.calendarStatusLabel || anfrage.calendarStatus)}`] }
  ];
}

function gwArchiveLinesFromList(list, emptyText) {
  if (!Array.isArray(list) || !list.length) return [emptyText];
  return list.flatMap((entry, index) => {
    if (typeof entry === 'string') return [`${index + 1}. ${entry}`];
    const lines = [`${index + 1}. ${gwArchiveSafeText(entry.title || entry.subject || entry.type || entry.status || 'Eintrag')}`];
    const date = entry.createdAt || entry.created_at || entry.date || entry.datum || entry.time || entry.timestamp;
    if (date) lines.push(`   Datum: ${gwArchiveDateLabel(date)}`);
    const author = entry.author || entry.user || entry.by || entry.from;
    if (author) lines.push(`   Von: ${author}`);
    const text = entry.text || entry.note || entry.message || entry.body || entry.content || entry.details;
    if (text) lines.push(`   ${String(text).replace(/\s+/g, ' ').trim()}`);
    return lines;
  });
}

app.get('/admin/requests/:id/archive.zip', requireLogin, async (req, res) => {
  try {
    const anfragen = await readAnfragen();
    const anfrage = (Array.isArray(anfragen) ? anfragen : []).find(a => String(a.id) === String(req.params.id));
    if (!anfrage) return res.status(404).send('Auftrag nicht gefunden.');

    const ticket = gwArchiveTicket(anfrage);
    const year = new Date().getFullYear();
    const zipName = `GW-${year}-${ticket}-Auftragsakte.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      console.error('[AUFTRAGSAKTE] ZIP Fehler:', err);
      if (!res.headersSent) res.status(500).send('Auftragsakte konnte nicht erstellt werden.');
      else res.end();
    });
    archive.pipe(res);

    archive.append(await gwArchivePdfBuffer('Auftragsdaten #' + ticket, gwArchiveBuildMainPdfSections(anfrage)), { name: '01-Auftragsdaten.pdf' });

    const latestInvoice = Array.isArray(anfrage.invoices) && anfrage.invoices.length ? anfrage.invoices[0] : null;
    if (latestInvoice) {
      const invoiceSections = [
        { heading: 'Rechnung / Zahlung', lines: [`Rechnungsnummer: ${gwArchiveSafeText(latestInvoice.number)}`, `Dokument: ${gwArchiveSafeText(latestInvoice.documentTitle || latestInvoice.kind)}`, `Status: ${gwArchiveSafeText(latestInvoice.status)}`, `Zahlungsart: ${gwArchiveSafeText(latestInvoice.paymentLabel || latestInvoice.paymentMethod)}`, `Gesamtbetrag: ${gwArchiveSafeText(latestInvoice.gross || latestInvoice.total || latestInvoice.amount)} €`, `Erstellt: ${gwArchiveSafeText(latestInvoice.createdAtLabel || latestInvoice.createdAt)}`, `Bezahlt am: ${gwArchiveSafeText(latestInvoice.paidAtLabel || latestInvoice.paidAt)}`] },
        { heading: 'Positionen', lines: Array.isArray(latestInvoice.items) ? latestInvoice.items.map((item, index) => `${index + 1}. ${gwArchiveSafeText(item.description || item.name)} | Menge: ${gwArchiveSafeText(item.qty || item.quantity || '1')} | Preis: ${gwArchiveSafeText(item.price || item.amount || '')}`) : ['Keine Positionen gespeichert.'] }
      ];
      archive.append(await gwArchivePdfBuffer('Rechnung / Zahlungsnachweis #' + ticket, invoiceSections), { name: '02-Rechnung-Zahlung.pdf' });
    } else {
      archive.append(await gwArchivePdfBuffer('Rechnung / Zahlungsnachweis #' + ticket, [{ heading: 'Rechnung', lines: ['Für diesen Auftrag ist keine Rechnung im Dashboard gespeichert.'] }]), { name: '02-Rechnung-Zahlung.pdf' });
    }

    const internalNotes = anfrage.internalNotes || anfrage.notes || anfrage.notizen || anfrage.adminNotes || [];
    archive.append(await gwArchivePdfBuffer('Interne Notizen #' + ticket, [{ heading: 'Interne Notizen', lines: gwArchiveLinesFromList(internalNotes, 'Keine internen Notizen gespeichert.') }]), { name: '06-Interne-Notizen.pdf' });

    const replies = anfrage.customerReplies || anfrage.replies || anfrage.inboundReplies || anfrage.inboundMessages || anfrage.customerEmails || [];
    archive.append(await gwArchivePdfBuffer('Kundenantworten #' + ticket, [{ heading: 'Kundenantworten / E-Mails', lines: gwArchiveLinesFromList(replies, 'Keine Kundenantworten gespeichert.') }]), { name: '07-Kundenantworten.pdf' });

    const history = anfrage.statusHistory || anfrage.history || anfrage.timeline || anfrage.activities || [];
    archive.append(await gwArchivePdfBuffer('Statusverlauf #' + ticket, [{ heading: 'Statusverlauf', lines: gwArchiveLinesFromList(history, 'Kein Statusverlauf gespeichert.') }]), { name: '08-Statusverlauf.pdf' });

    const paymentLines = [`Zahlungswunsch Kunde: ${gwArchiveSafeText(anfrage.zahlungswunsch || anfrage.paymentPreference || anfrage.paymentWish)}`];
    if (latestInvoice) {
      paymentLines.push(`Rechnung: ${gwArchiveSafeText(latestInvoice.number)}`);
      paymentLines.push(`Zahlungsart: ${gwArchiveSafeText(latestInvoice.paymentLabel || latestInvoice.paymentMethod)}`);
      paymentLines.push(`Status: ${gwArchiveSafeText(latestInvoice.status)}`);
      paymentLines.push(`Bezahlt am: ${gwArchiveSafeText(latestInvoice.paidAtLabel || latestInvoice.paidAt)}`);
    }
    archive.append(await gwArchivePdfBuffer('Zahlungsnachweis #' + ticket, [{ heading: 'Zahlung', lines: paymentLines }]), { name: '09-Zahlungsnachweis.pdf' });

    const photos = gwArchiveCollectPhotos(anfrage);
    const seen = new Set();
    for (const file of photos) {
      const key = file.path + '|' + file.folder + '|' + file.name;
      if (seen.has(key)) continue;
      seen.add(key);
      archive.file(file.path, { name: `${file.folder}/${gwArchiveCleanFileName(file.name)}` });
    }

    archive.append(JSON.stringify(anfrage, null, 2), { name: '99-Rohdaten-Auftrag.json' });

    if (typeof addActivity === 'function') addActivity(req, 'archive_downloaded', { requestId: anfrage.id, ticket: '#' + ticket });
    await archive.finalize();
  } catch (err) {
    console.error('[AUFTRAGSAKTE] Fehler:', err);
    if (!res.headersSent) res.status(500).send('Auftragsakte konnte nicht erstellt werden: ' + err.message);
  }
});
`;

function patchServer() {
  backup(serverPath, 'auftrag-archive');
  let server = read(serverPath);
  if (server.includes('GrünWerk Auftragsakte / Nachweis-ZIP')) {
    console.log('server.js enthält die Auftragsakte bereits.');
    return;
  }
  server = ensureRequire(server, 'path', 'path');
  server = ensureRequire(server, 'fs', 'fs');
  server = ensureRequire(server, 'archiver', 'archiver');
  server = ensureRequire(server, 'pdfkit', 'PDFDocument');

  const adminMarker = "app.get('/admin'";
  const listenMarker = 'app.listen(';
  const markerIndex = server.indexOf(adminMarker) >= 0 ? server.indexOf(adminMarker) : server.indexOf(listenMarker);
  if (markerIndex < 0) throw new Error('Konnte keine passende Stelle für die Auftragsakte-Route finden.');
  server = server.slice(0, markerIndex) + serverBlock + '\n' + server.slice(markerIndex);
  write(serverPath, server);
  try {
    execSync(`node -c "${serverPath}"`, { stdio: 'pipe' });
    console.log('server.js Syntaxprüfung erfolgreich.');
  } catch (err) {
    const backups = fs.readdirSync(path.dirname(serverPath)).filter(f => f.startsWith('server.js.backup-before-auftrag-archive-')).sort();
    const latest = backups[backups.length - 1];
    if (latest) fs.copyFileSync(path.join(path.dirname(serverPath), latest), serverPath);
    throw new Error('server.js hatte nach dem Einbau einen Syntaxfehler. Backup wurde wiederhergestellt. ' + err.message);
  }
}

function patchAdmin() {
  if (!fs.existsSync(adminPath)) return console.log('views/admin.ejs nicht gefunden, Button wird nicht eingebaut.');
  backup(adminPath, 'auftrag-archive');
  let admin = read(adminPath);
  if (admin.includes('Auftragsakte herunterladen')) {
    console.log('admin.ejs enthält den Auftragsakte-Button bereits.');
    return;
  }
  const button = `<a class="button secondary archive-download-button" href="/admin/requests/<%= a.id %>/archive.zip">📦 Auftragsakte herunterladen</a>`;
  if (admin.includes('<div class="admin-card-actions">')) {
    admin = admin.replace('<div class="admin-card-actions">', `<div class="admin-card-actions">\n                      ${button}`);
  } else if (admin.includes('<div class="request-expanded-content">')) {
    admin = admin.replace('<div class="request-expanded-content">', `<div class="request-expanded-content">\n                    <section class="archive-lite-panel"><h4>Nachweis & Archiv</h4><p>Alle wichtigen Auftragsdaten, Rechnung, Notizen, Kundenantworten und Fotos als ZIP herunterladen.</p>${button}</section>`);
  } else {
    console.log('Keine passende Stelle für den Button gefunden. Route funktioniert trotzdem.');
  }
  write(adminPath, admin);
}

function patchCss() {
  if (!fs.existsSync(cssPath)) return;
  backup(cssPath, 'auftrag-archive');
  let css = read(cssPath);
  if (css.includes('archive-download-button')) return console.log('style.css enthält Archiv-Styles bereits.');
  css += `

/* Auftragsakte / Nachweis-ZIP */
.archive-lite-panel {
  border: 1px solid rgba(22, 78, 48, .14);
  background: #f8fbf4;
  border-radius: 18px;
  padding: 14px;
  margin: 12px 0;
}
.archive-lite-panel h4 {
  margin: 0 0 6px;
  color: #143820;
}
.archive-lite-panel p {
  margin: 0 0 10px;
  color: #5d6d5d;
  font-size: .92rem;
  line-height: 1.45;
}
.archive-download-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-decoration: none;
  border-radius: 999px;
  font-weight: 900;
}
`;
  write(cssPath, css);
}

try {
  addDependencies();
  patchServer();
  patchAdmin();
  patchCss();
  console.log('\nFertig. Bitte jetzt ausführen:');
  console.log('npm install');
  console.log('git add .');
  console.log('git commit -m "Auftragsakte als ZIP hinzugefuegt"');
  console.log('git push');
} catch (error) {
  console.error('\nFehler beim Einbau:', error.message);
  process.exit(1);
}
