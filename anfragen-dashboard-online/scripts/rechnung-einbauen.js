const fs = require('fs');
const path = require('path');

const root = process.cwd();
const now = new Date().toISOString().replace(/[:.]/g, '-');

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}
function write(file, content) {
  fs.writeFileSync(path.join(root, file), content, 'utf8');
}
function backup(file) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) return;
  const target = path.join(root, `${file}.backup-before-invoices-${now}`);
  fs.copyFileSync(source, target);
}
function ensureFile(file) {
  if (!fs.existsSync(path.join(root, file))) {
    throw new Error(`Datei nicht gefunden: ${file}. Bitte Script im Projektordner ausführen.`);
  }
}
function replaceOnce(content, marker, replacement, label) {
  if (!content.includes(marker)) {
    throw new Error(`Marker nicht gefunden: ${label}`);
  }
  return content.replace(marker, replacement);
}

ensureFile('server.js');
ensureFile('views/admin.ejs');
ensureFile('public/style.css');
ensureFile('package.json');

backup('server.js');
backup('views/admin.ejs');
backup('public/style.css');
backup('package.json');

// package.json: pdfkit hinzufügen
const packagePath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
if (!pkg.dependencies.pdfkit) {
  pkg.dependencies.pdfkit = '^0.15.2';
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log('package.json: pdfkit hinzugefügt. Danach bitte npm install ausführen.');
} else {
  console.log('package.json: pdfkit ist bereits vorhanden.');
}

let server = read('server.js');

// server.js: PDFKit importieren
if (!server.includes("require('pdfkit')") && !server.includes('require("pdfkit")')) {
  const appMarker = 'const app = express();';
  if (server.includes(appMarker)) {
    server = server.replace(appMarker, "const PDFDocument = require('pdfkit');\n" + appMarker);
  } else {
    throw new Error('Konnte const app = express(); nicht finden.');
  }
}

const invoiceServerCode = String.raw`

// ------------------------------------------------------------
// GrünWerk Rechnung / Barrechnung PDF
// ------------------------------------------------------------
function gwInvoiceText(value, max = 220) {
  return String(value || '').replace(/[<>]/g, '').replace(/\r\n/g, '\n').trim().slice(0, max);
}

function gwInvoiceMoney(value) {
  const normalized = String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function gwInvoiceQty(value) {
  const normalized = String(value || '1').replace(',', '.').replace(/[^0-9.-]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : 1;
}

function gwEuro(value) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value || 0));
}

function gwDateLabel(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
}

function gwInvoiceAll(anfragen) {
  return anfragen.flatMap(a => Array.isArray(a.invoices) ? a.invoices : []);
}

function gwNextInvoiceNumber(anfragen, kind) {
  const year = new Date().getFullYear();
  const prefix = kind === 'cash' ? 'BR' : 'RG';
  const pattern = new RegExp('^' + prefix + '-' + year + '-(\\d{4})$');
  const max = gwInvoiceAll(anfragen).reduce((highest, invoice) => {
    const match = String(invoice.number || '').match(pattern);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return prefix + '-' + year + '-' + String(max + 1).padStart(4, '0');
}

function gwBuildInvoiceFromBody(body, anfrage, anfragen) {
  const paymentMethod = gwInvoiceText(body.paymentMethod, 30) || 'bank';
  const kind = paymentMethod === 'cash' ? 'cash' : 'invoice';
  const taxMode = gwInvoiceText(body.taxMode, 30) || 'small_business';
  const descriptions = Array.isArray(body.description) ? body.description : [body.description];
  const quantities = Array.isArray(body.quantity) ? body.quantity : [body.quantity];
  const units = Array.isArray(body.unit) ? body.unit : [body.unit];
  const unitPrices = Array.isArray(body.unitPrice) ? body.unitPrice : [body.unitPrice];
  const items = [];

  descriptions.forEach((description, index) => {
    const cleanDescription = gwInvoiceText(description, 180);
    const price = gwInvoiceMoney(unitPrices[index]);
    if (!cleanDescription || price <= 0) return;
    const qty = gwInvoiceQty(quantities[index]);
    const unit = gwInvoiceText(units[index] || 'Stk.', 20) || 'Stk.';
    const total = Math.round(qty * price * 100) / 100;
    items.push({ description: cleanDescription, quantity: qty, unit, unitPrice: price, total });
  });

  if (!items.length) {
    items.push({ description: gwInvoiceText(anfrage.kategorie || anfrage.leistung || 'Gartenbau-Leistung', 180), quantity: 1, unit: 'Stk.', unitPrice: 0, total: 0 });
  }

  const net = Math.round(items.reduce((sum, item) => sum + item.total, 0) * 100) / 100;
  const vatRate = taxMode === 'vat19' ? 0.19 : 0;
  const vat = Math.round(net * vatRate * 100) / 100;
  const gross = Math.round((net + vat) * 100) / 100;
  const createdAt = new Date().toISOString();
  const dueDays = Number(body.dueDays || 14);
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (Number.isFinite(dueDays) ? dueDays : 14));

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    number: gwNextInvoiceNumber(anfragen, kind),
    kind,
    documentTitle: kind === 'cash' ? 'Barrechnung / Quittung' : 'Rechnung',
    paymentMethod,
    paymentLabel: paymentMethod === 'cash' ? 'Barzahlung' : paymentMethod === 'card' ? 'Kartenzahlung / Sonstiges' : 'Überweisung',
    taxMode,
    taxLabel: taxMode === 'vat19' ? 'Umsatzsteuer 19 %' : 'Kleinunternehmerregelung',
    status: kind === 'cash' ? 'Bezahlt' : 'Offen',
    paidAt: kind === 'cash' ? createdAt : '',
    createdAt,
    createdAtLabel: gwDateLabel(createdAt),
    dueDate: kind === 'cash' ? '' : dueDate.toISOString(),
    dueDateLabel: kind === 'cash' ? '' : gwDateLabel(dueDate),
    note: gwInvoiceText(body.invoiceNote, 500),
    items,
    net,
    vat,
    gross
  };
}

function gwDrawInvoicePdf(doc, anfrage, invoice) {
  const green = '#194d2f';
  const lightGreen = '#edf6ec';
  const dark = '#1f2f25';
  const muted = '#667466';
  const left = 50;
  const right = 545;
  let y = 52;

  doc.fillColor(green).fontSize(22).font('Helvetica-Bold').text('GrünWerk Gartenbau', left, y);
  doc.fillColor(muted).fontSize(9).font('Helvetica').text('Gartenpflege · Gestaltung · Pflaster & Wege', left, y + 27);
  doc.fillColor(dark).fontSize(10).text('Oliver Perlewitz', left, y + 48);
  doc.text(process.env.INVOICE_COMPANY_ADDRESS || 'Adresse bitte in INVOICE_COMPANY_ADDRESS setzen', left, y + 63, { width: 240 });

  doc.fillColor(dark).fontSize(18).font('Helvetica-Bold').text(invoice.documentTitle.toUpperCase(), 350, y, { width: 195, align: 'right' });
  doc.fontSize(10).font('Helvetica').fillColor(muted).text('Nr. ' + invoice.number, 350, y + 30, { width: 195, align: 'right' });
  doc.text('Datum: ' + invoice.createdAtLabel, 350, y + 45, { width: 195, align: 'right' });
  if (invoice.dueDateLabel) doc.text('Fällig bis: ' + invoice.dueDateLabel, 350, y + 60, { width: 195, align: 'right' });

  y = 145;
  doc.save().rect(left, y, right - left, 4).fill(green).restore();
  y += 28;

  doc.fillColor(green).fontSize(9).font('Helvetica-Bold').text('RECHNUNG AN', left, y);
  y += 16;
  doc.fillColor(dark).fontSize(11).font('Helvetica-Bold').text(gwInvoiceText(anfrage.name || 'Kunde', 120), left, y);
  doc.font('Helvetica').fontSize(10).fillColor(dark);
  if (anfrage.adresse) doc.text(gwInvoiceText(anfrage.adresse, 160), left, y + 16, { width: 240 });
  if (anfrage.email) doc.text(gwInvoiceText(anfrage.email, 160), left, y + 32, { width: 240 });

  doc.fillColor(green).fontSize(9).font('Helvetica-Bold').text('AUFTRAG', 350, y);
  doc.font('Helvetica').fillColor(dark).fontSize(10).text('Ticket: #' + String(anfrage.id || '').slice(-6), 350, y + 16, { width: 195 });
  doc.text('Leistung: ' + gwInvoiceText(anfrage.kategorie || anfrage.leistung || 'Gartenbau', 100), 350, y + 32, { width: 195 });
  doc.text('Zahlungsart: ' + invoice.paymentLabel, 350, y + 48, { width: 195 });

  y += 92;
  doc.roundedRect(left, y, right - left, 30, 8).fill(lightGreen);
  doc.fillColor(green).font('Helvetica-Bold').fontSize(9);
  doc.text('Pos.', left + 10, y + 10, { width: 30 });
  doc.text('Beschreibung', left + 45, y + 10, { width: 230 });
  doc.text('Menge', left + 290, y + 10, { width: 55, align: 'right' });
  doc.text('Einzelpreis', left + 355, y + 10, { width: 75, align: 'right' });
  doc.text('Gesamt', left + 440, y + 10, { width: 55, align: 'right' });
  y += 40;

  invoice.items.forEach((item, index) => {
    const rowHeight = 34;
    doc.fillColor(index % 2 === 0 ? '#ffffff' : '#fbfcf8').rect(left, y - 6, right - left, rowHeight).fill();
    doc.fillColor(dark).font('Helvetica').fontSize(9);
    doc.text(String(index + 1), left + 10, y, { width: 30 });
    doc.font('Helvetica-Bold').text(item.description, left + 45, y, { width: 230 });
    doc.font('Helvetica').text(String(item.quantity).replace('.', ',') + ' ' + item.unit, left + 290, y, { width: 55, align: 'right' });
    doc.text(gwEuro(item.unitPrice), left + 355, y, { width: 75, align: 'right' });
    doc.text(gwEuro(item.total), left + 440, y, { width: 55, align: 'right' });
    y += rowHeight;
  });

  y += 12;
  const totalsX = 350;
  doc.fillColor(dark).fontSize(10).font('Helvetica');
  doc.text('Zwischensumme', totalsX, y, { width: 95 });
  doc.text(gwEuro(invoice.net), 445, y, { width: 100, align: 'right' });
  y += 18;
  if (invoice.taxMode === 'vat19') {
    doc.text('Umsatzsteuer 19 %', totalsX, y, { width: 110 });
    doc.text(gwEuro(invoice.vat), 445, y, { width: 100, align: 'right' });
    y += 18;
  }
  doc.roundedRect(totalsX - 8, y - 8, 203, 38, 8).fill(green);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text('Gesamtbetrag', totalsX, y + 4, { width: 100 });
  doc.text(gwEuro(invoice.gross), 445, y + 4, { width: 100, align: 'right' });

  y += 58;
  doc.fillColor(dark).font('Helvetica-Bold').fontSize(10).text('Zahlung & Hinweis', left, y);
  y += 17;
  doc.font('Helvetica').fontSize(9).fillColor(dark);
  if (invoice.kind === 'cash') {
    doc.text('Der Betrag wurde dankend bar erhalten. Zahlungsstatus: bezahlt.', left, y, { width: right - left });
  } else {
    doc.text('Bitte überweise den Gesamtbetrag unter Angabe der Rechnungsnummer als Verwendungszweck.', left, y, { width: right - left });
    y += 14;
    doc.text('IBAN: ' + (process.env.INVOICE_IBAN || 'DE... bitte in INVOICE_IBAN setzen'), left, y, { width: right - left });
  }
  y += 18;
  if (invoice.taxMode === 'small_business') {
    doc.fillColor(muted).text('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', left, y, { width: right - left });
    y += 14;
  }
  if (invoice.note) {
    doc.fillColor(muted).text(invoice.note, left, y, { width: right - left });
  }

  doc.fillColor('#8a9587').fontSize(8).text('GrünWerk Gartenbau · ' + (process.env.INVOICE_FOOTER || 'Vielen Dank für deinen Auftrag.'), left, 760, { width: right - left, align: 'center' });
}

app.post('/admin/invoices/:id/create', requireLogin, verifyCsrf, async (req, res) => {
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => String(a.id) === String(req.params.id));
  if (!anfrage) return res.status(404).send('Anfrage nicht gefunden.');

  const invoice = gwBuildInvoiceFromBody(req.body, anfrage, anfragen);
  anfrage.invoices = Array.isArray(anfrage.invoices) ? anfrage.invoices : [];
  anfrage.invoices.unshift(invoice);
  await createBackup('before-invoice-create');
  await writeAnfragen(anfragen);
  if (typeof addActivity === 'function') addActivity(req, 'invoice_created', { requestId: anfrage.id, invoice: invoice.number, total: gwEuro(invoice.gross), payment: invoice.paymentLabel });
  res.redirect('/admin#request-' + encodeURIComponent(anfrage.id));
});

app.get('/admin/invoices/:requestId/:invoiceId.pdf', requireLogin, async (req, res) => {
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => String(a.id) === String(req.params.requestId));
  if (!anfrage) return res.status(404).send('Anfrage nicht gefunden.');
  const invoice = (Array.isArray(anfrage.invoices) ? anfrage.invoices : []).find(item => String(item.id) === String(req.params.invoiceId));
  if (!invoice) return res.status(404).send('Rechnung nicht gefunden.');

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="' + invoice.number + '.pdf"');
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);
  gwDrawInvoicePdf(doc, anfrage, invoice);
  doc.end();
});

app.post('/admin/invoices/:requestId/:invoiceId/paid', requireLogin, verifyCsrf, async (req, res) => {
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => String(a.id) === String(req.params.requestId));
  if (!anfrage) return res.status(404).send('Anfrage nicht gefunden.');
  const invoices = Array.isArray(anfrage.invoices) ? anfrage.invoices : [];
  const invoice = invoices.find(item => String(item.id) === String(req.params.invoiceId));
  if (!invoice) return res.status(404).send('Rechnung nicht gefunden.');
  invoice.status = 'Bezahlt';
  invoice.paidAt = new Date().toISOString();
  invoice.paidAtLabel = gwDateLabel(invoice.paidAt);
  await createBackup('before-invoice-paid');
  await writeAnfragen(anfragen);
  if (typeof addActivity === 'function') addActivity(req, 'invoice_paid', { requestId: anfrage.id, invoice: invoice.number });
  res.redirect('/admin#request-' + encodeURIComponent(anfrage.id));
});
`;

if (!server.includes('GrünWerk Rechnung / Barrechnung PDF')) {
  const routeMarker = "app.get('/admin'";
  if (!server.includes(routeMarker)) throw new Error("Konnte app.get('/admin' nicht finden.");
  server = server.replace(routeMarker, invoiceServerCode + '\n' + routeMarker);
  write('server.js', server);
  console.log('server.js: Rechnungsrouten eingebaut.');
} else {
  console.log('server.js: Rechnungsrouten waren bereits vorhanden.');
}

let admin = read('views/admin.ejs');
const invoiceAdminBlock = String.raw`

                    <details class="invoice-panel-clean">
                      <summary>Zahlung & Rechnung</summary>
                      <% const invoices = Array.isArray(a.invoices) ? a.invoices : []; %>
                      <div class="invoice-panel-body">
                        <% if (invoices.length) { %>
                          <div class="invoice-list-clean">
                            <% invoices.forEach(invoice => { %>
                              <div class="invoice-list-item-clean">
                                <div>
                                  <strong><%= invoice.number %></strong>
                                  <span><%= invoice.documentTitle || 'Rechnung' %> · <%= invoice.paymentLabel || '-' %> · <%= invoice.status || 'Offen' %></span>
                                  <small><%= invoice.createdAtLabel || '' %> · <%= new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(invoice.gross || 0) %></small>
                                </div>
                                <div class="invoice-actions-clean">
                                  <a class="button secondary" target="_blank" href="/admin/invoices/<%= a.id %>/<%= invoice.id %>.pdf">PDF öffnen</a>
                                  <% if ((invoice.status || 'Offen') !== 'Bezahlt') { %>
                                    <form action="/admin/invoices/<%= a.id %>/<%= invoice.id %>/paid" method="POST">
                                      <input type="hidden" name="_csrf" value="<%= csrfToken %>">
                                      <button type="submit">Als bezahlt markieren</button>
                                    </form>
                                  <% } %>
                                </div>
                              </div>
                            <% }) %>
                          </div>
                        <% } %>

                        <form action="/admin/invoices/<%= a.id %>/create" method="POST" class="invoice-form-clean">
                          <input type="hidden" name="_csrf" value="<%= csrfToken %>">
                          <div class="invoice-grid-clean">
                            <label><span>Zahlungsart</span><select name="paymentMethod"><option value="bank">Rechnung / Überweisung</option><option value="cash">Barzahlung / Quittung</option><option value="card">Kartenzahlung / Sonstiges</option></select></label>
                            <label><span>Steuer</span><select name="taxMode"><option value="small_business">Kleinunternehmer § 19 UStG</option><option value="vat19">Umsatzsteuer 19 %</option></select></label>
                            <label><span>Zahlbar in Tagen</span><input name="dueDays" value="14" inputmode="numeric"></label>
                          </div>

                          <div class="invoice-items-clean">
                            <strong>Positionen</strong>
                            <% for (let i = 0; i < 4; i++) { %>
                              <div class="invoice-item-row-clean">
                                <input name="description" placeholder="Leistung, z. B. Gartenpflege vor Ort" value="<%= i === 0 ? (leistung || a.kategorie || 'Gartenbau-Leistung') : '' %>">
                                <input name="quantity" placeholder="Menge" value="<%= i === 0 ? '1' : '' %>">
                                <input name="unit" placeholder="Einheit" value="<%= i === 0 ? 'Stk.' : '' %>">
                                <input name="unitPrice" placeholder="Preis €">
                              </div>
                            <% } %>
                          </div>
                          <textarea name="invoiceNote" placeholder="Optionaler Hinweis auf der Rechnung"></textarea>
                          <button type="submit">Rechnung / Quittung erstellen</button>
                        </form>
                      </div>
                    </details>
`;

if (!admin.includes('invoice-panel-clean')) {
  const markers = [
    '                    <div class="admin-card-actions">',
    '                    <details class="status-update-panel">',
    '                  </article>'
  ];
  let patched = false;
  for (const marker of markers) {
    if (admin.includes(marker)) {
      admin = admin.replace(marker, invoiceAdminBlock + '\n' + marker);
      patched = true;
      break;
    }
  }
  if (!patched) throw new Error('Konnte keine passende Stelle in views/admin.ejs finden.');
  write('views/admin.ejs', admin);
  console.log('views/admin.ejs: Zahlungs- und Rechnungsbereich eingebaut.');
} else {
  console.log('views/admin.ejs: Rechnungsbereich war bereits vorhanden.');
}

const invoiceCss = String.raw`

/* GrünWerk Zahlung & Rechnung */
.invoice-panel-clean {
  margin-top: 14px;
  border: 1px solid rgba(31, 93, 56, 0.14);
  border-radius: 22px;
  background: #fffdf8;
  overflow: hidden;
}
.invoice-panel-clean summary {
  cursor: pointer;
  padding: 14px 16px;
  font-weight: 900;
  color: #163821;
  background: linear-gradient(135deg, #f2f7ee, #fffdf8);
}
.invoice-panel-body {
  padding: 16px;
  display: grid;
  gap: 16px;
}
.invoice-list-clean {
  display: grid;
  gap: 10px;
}
.invoice-list-item-clean {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  border: 1px solid rgba(31, 93, 56, 0.11);
  background: #ffffff;
  border-radius: 16px;
  padding: 12px;
}
.invoice-list-item-clean strong { display:block; color:#163821; }
.invoice-list-item-clean span,
.invoice-list-item-clean small { display:block; color:#667466; margin-top:3px; }
.invoice-actions-clean {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.invoice-actions-clean form { margin: 0; }
.invoice-form-clean {
  display: grid;
  gap: 12px;
  border-top: 1px solid rgba(31, 93, 56, 0.12);
  padding-top: 14px;
}
.invoice-grid-clean {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.invoice-grid-clean label span {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 900;
  color: #667466;
  text-transform: uppercase;
  letter-spacing: .08em;
}
.invoice-form-clean input,
.invoice-form-clean select,
.invoice-form-clean textarea {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(31, 93, 56, 0.18);
  border-radius: 14px;
  background: #fff;
  color: #163821;
  font: inherit;
  padding: 0 12px;
  box-sizing: border-box;
}
.invoice-form-clean textarea {
  min-height: 78px;
  padding: 12px;
  resize: vertical;
}
.invoice-items-clean {
  display: grid;
  gap: 8px;
}
.invoice-items-clean > strong {
  color: #163821;
}
.invoice-item-row-clean {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 75px 80px 100px;
  gap: 8px;
}
@media (max-width: 760px) {
  .invoice-grid-clean,
  .invoice-item-row-clean {
    grid-template-columns: 1fr;
  }
  .invoice-list-item-clean {
    display: grid;
  }
}
`;

let style = read('public/style.css');
if (!style.includes('GrünWerk Zahlung & Rechnung')) {
  style += invoiceCss;
  write('public/style.css', style);
  console.log('public/style.css: Rechnungsdesign hinzugefügt.');
} else {
  console.log('public/style.css: Rechnungsdesign war bereits vorhanden.');
}

console.log('\nFertig. Nächste Schritte:');
console.log('1) npm install');
console.log('2) git add .');
console.log('3) git commit -m "Rechnung und Barzahlung als PDF hinzugefuegt"');
console.log('4) git push');
