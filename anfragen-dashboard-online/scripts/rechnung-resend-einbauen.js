const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const SERVER = path.join(ROOT, 'server.js');
const PACKAGE = path.join(ROOT, 'package.json');
const BACKUP_SUFFIX = 'backup-before-invoice-resend';

function fail(message) {
  console.error('\n❌ ' + message);
  process.exit(1);
}

function backup(file) {
  if (!fs.existsSync(file)) return null;
  const backupPath = file + '.' + BACKUP_SUFFIX;
  fs.copyFileSync(file, backupPath);
  console.log('Backup erstellt:', path.relative(ROOT, backupPath));
  return backupPath;
}

function restore(file, backupPath) {
  if (backupPath && fs.existsSync(backupPath)) {
    fs.copyFileSync(backupPath, file);
    console.log('Zurückgesetzt:', path.relative(ROOT, file));
  }
}

function removeBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return source;
  const end = source.indexOf(endMarker, start);
  if (end === -1) return source;
  return source.slice(0, start).trimEnd() + '\n\n' + source.slice(end + endMarker.length).trimStart();
}

if (!fs.existsSync(SERVER)) fail('server.js wurde nicht gefunden. Bitte im Projektordner ausführen.');
if (!fs.existsSync(PACKAGE)) fail('package.json wurde nicht gefunden. Bitte im Projektordner ausführen.');

const serverBackup = backup(SERVER);
const packageBackup = backup(PACKAGE);

let server = fs.readFileSync(SERVER, 'utf8');
let pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));

try {
  // Alten SMTP-Rechnungsblock entfernen, falls vorhanden.
  server = removeBlock(server, '// === INVOICE SMTP SERVER START ===', '// === INVOICE SMTP SERVER END ===');
  server = removeBlock(server, '// === INVOICE RESEND SERVER START ===', '// === INVOICE RESEND SERVER END ===');

  // PDFKit einfügen, falls noch nicht vorhanden.
  if (!server.includes("require('pdfkit')") && !server.includes('require("pdfkit")')) {
    const anchor = "const bcrypt = require('bcryptjs');";
    if (server.includes(anchor)) {
      server = server.replace(anchor, anchor + "\nconst PDFDocument = require('pdfkit');");
    } else {
      const appAnchor = 'const app = express();';
      if (!server.includes(appAnchor)) throw new Error('Konnte require-Bereich nicht finden.');
      server = server.replace(appAnchor, "const PDFDocument = require('pdfkit');\n" + appAnchor);
    }
  }

  const routeBlock = String.raw`
// === INVOICE RESEND SERVER START ===
const INVOICE_RESEND_DIR = path.join(DATA_DIR, 'invoices');
if (!fs.existsSync(INVOICE_RESEND_DIR)) fs.mkdirSync(INVOICE_RESEND_DIR, { recursive: true });

function invoiceResendText(value, max = 1000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function invoiceResendMoney(value) {
  const number = Number(value || 0) || 0;
  return number.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function invoiceResendGermanDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('de-DE');
  return date.toLocaleDateString('de-DE');
}

function invoiceResendSafeFileName(value) {
  return String(value || 'rechnung').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'rechnung';
}

function invoiceResendTitle(kind) {
  if (kind === 'cash') return 'BARRECHNUNG / QUITTUNG';
  if (kind === 'paypal') return 'RECHNUNG / PAYPAL';
  if (kind === 'card') return 'RECHNUNG / KARTENZAHLUNG';
  return 'RECHNUNG';
}

function invoiceResendPaymentText(invoice) {
  const kind = invoice.kind || 'invoice';
  if (kind === 'cash') return 'Betrag dankend bar erhalten am ' + invoiceResendGermanDate(invoice.invDate) + '.';
  if (kind === 'paypal') return 'Zahlungsart: PayPal. Bitte zahle den Betrag per PayPal' + (invoice.paypalEmail ? ' an ' + invoice.paypalEmail : '') + '. Verwendungszweck: ' + invoice.invNo;
  if (kind === 'card') return 'Zahlungsart: Kartenzahlung / Sonstiges.';
  return 'Bitte überweise den Betrag innerhalb von 14 Tagen. Verwendungszweck: ' + invoice.invNo;
}

function invoiceResendBuildPdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#123b25';
    const muted = '#5d6c5c';
    const light = '#f4f7ef';
    const title = invoiceResendTitle(invoice.kind);
    const companyName = invoiceResendText(invoice.companyName || 'GrünWerk Gartenbau', 120);
    const companyAddress = invoiceResendText(invoice.companyAddress || process.env.INVOICE_COMPANY_ADDRESS || '', 500);
    const paymentText = invoiceResendPaymentText(invoice);
    const rows = Array.isArray(invoice.rows) ? invoice.rows : [];
    const total = Number(invoice.total || rows.reduce((sum, row) => sum + Number(row.total || 0), 0)) || 0;

    doc.fillColor(green).fontSize(24).text(companyName, 48, 48, { width: 270 });
    doc.fillColor(muted).fontSize(10).text(companyAddress || 'Firmenadresse in Render Environment hinterlegen', 48, 82, { width: 260, lineGap: 3 });

    doc.fillColor(green).fontSize(11).text('Rechnungsnummer', 360, 50, { align: 'right' });
    doc.fillColor('#111111').fontSize(14).text(invoiceResendText(invoice.invNo || 'RG', 80), 360, 66, { align: 'right' });
    doc.fillColor(muted).fontSize(10).text('Datum: ' + invoiceResendGermanDate(invoice.invDate), 360, 88, { align: 'right' });
    doc.text('Leistungsdatum: ' + invoiceResendGermanDate(invoice.serviceDate), 360, 103, { align: 'right' });
    doc.text('Ticket: ' + invoiceResendText(invoice.ticket || '-', 80), 360, 118, { align: 'right' });

    doc.roundedRect(48, 145, 500, 5, 2).fill(green);
    doc.fillColor(green).fontSize(26).text(title, 48, 172);

    doc.roundedRect(48, 215, 230, 105, 14).fill(light);
    doc.roundedRect(318, 215, 230, 105, 14).fill(light);
    doc.fillColor(muted).fontSize(9).text('RECHNUNG AN', 66, 232);
    doc.fillColor('#111111').fontSize(12).text(invoiceResendText(invoice.customerName || 'Kunde', 120), 66, 250, { width: 190 });
    doc.fillColor('#333333').fontSize(10).text(invoiceResendText(invoice.customerAddress || '', 260), 66, 268, { width: 190, lineGap: 3 });
    doc.fillColor(muted).fontSize(9).text('ZAHLUNG', 336, 232);
    doc.fillColor('#111111').fontSize(10).text(invoiceResendText(paymentText, 300), 336, 250, { width: 190, lineGap: 4 });

    let y = 355;
    doc.roundedRect(48, y, 500, 24, 8).fill(green);
    doc.fillColor('#ffffff').fontSize(9).text('POS.', 60, y + 8);
    doc.text('BESCHREIBUNG', 100, y + 8);
    doc.text('MENGE', 340, y + 8, { width: 50, align: 'right' });
    doc.text('PREIS', 405, y + 8, { width: 55, align: 'right' });
    doc.text('GESAMT', 480, y + 8, { width: 55, align: 'right' });
    y += 34;

    rows.forEach((row, index) => {
      if (y > 690) { doc.addPage(); y = 60; }
      const description = invoiceResendText(row.description || 'Leistung', 240);
      const qty = Number(row.qty || 1) || 1;
      const price = Number(row.price || 0) || 0;
      const rowTotal = Number(row.total || qty * price) || 0;
      doc.fillColor('#111111').fontSize(10).text(String(index + 1), 60, y);
      doc.text(description, 100, y, { width: 215 });
      doc.text(String(qty).replace('.', ','), 340, y, { width: 50, align: 'right' });
      doc.text(invoiceResendMoney(price), 405, y, { width: 55, align: 'right' });
      doc.text(invoiceResendMoney(rowTotal), 480, y, { width: 55, align: 'right' });
      y += Math.max(28, doc.heightOfString(description, { width: 215 }) + 12);
      doc.moveTo(48, y - 7).lineTo(548, y - 7).strokeColor('#e2e8dc').lineWidth(1).stroke();
    });

    y += 8;
    doc.roundedRect(318, y, 230, 54, 16).fill(green);
    doc.fillColor('#d9e8d6').fontSize(10).text('GESAMTBETRAG', 338, y + 13);
    doc.fillColor('#ffffff').fontSize(20).text(invoiceResendMoney(total), 338, y + 28, { width: 190, align: 'right' });
    y += 84;

    if (y > 650) { doc.addPage(); y = 60; }
    doc.roundedRect(48, y, 500, 82, 14).fill('#f1f7ed');
    doc.fillColor(green).fontSize(13).text('Zahlungsdaten', 66, y + 16);
    doc.fillColor('#111111').fontSize(10).text(invoiceResendText(invoice.paymentDetails || invoice.iban || paymentText, 600), 66, y + 36, { width: 460, lineGap: 3 });
    y += 108;

    doc.fillColor(green).fontSize(12).text('Hinweis', 48, y);
    doc.fillColor(muted).fontSize(9).text(invoiceResendText(invoice.legal || '', 600), 48, y + 18, { width: 500, lineGap: 3 });
    doc.text(invoiceResendText(invoice.footer || process.env.INVOICE_FOOTER || 'Vielen Dank für deinen Auftrag.', 400), 48, y + 58, { width: 500 });
    doc.end();
  });
}

async function invoiceResendSendMail({ from, to, subject, text, pdfBuffer, filename, replyTo }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY fehlt in Render Environment.');
  if (!from) throw new Error('RESEND_FROM oder MAIL_FROM fehlt in Render Environment.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: replyTo || process.env.REPLY_TO_EMAIL || process.env.MAIL_FROM || process.env.RESEND_FROM,
      attachments: [{
        filename,
        content: pdfBuffer.toString('base64')
      }]
    })
  });

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { raw }; }
  if (!response.ok) {
    const message = data.message || data.error || raw || 'Resend Versand fehlgeschlagen.';
    throw new Error(message);
  }
  return data;
}

app.post('/admin/invoice/send', requireLogin, verifyCsrf, async (req, res) => {
  try {
    const invoice = JSON.parse(String(req.body.invoiceData || '{}'));
    const to = invoiceResendText(invoice.customerEmail, 200);
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ ok: false, error: 'Kunden-E-Mail fehlt oder ist ungültig.' });
    if (!Array.isArray(invoice.rows) || invoice.rows.length === 0) return res.status(400).json({ ok: false, error: 'Keine Rechnungspositionen vorhanden.' });

    invoice.companyName = invoice.companyName || 'GrünWerk Gartenbau';
    invoice.companyAddress = invoice.companyAddress || process.env.INVOICE_COMPANY_ADDRESS || '';
    invoice.paypalEmail = invoice.paypalEmail || process.env.INVOICE_PAYPAL_EMAIL || '';
    invoice.footer = invoice.footer || process.env.INVOICE_FOOTER || 'Vielen Dank für deinen Auftrag.';
    invoice.paymentDetails = invoice.paymentDetails || [
      process.env.INVOICE_IBAN ? 'IBAN: ' + process.env.INVOICE_IBAN : '',
      process.env.INVOICE_BIC ? 'BIC: ' + process.env.INVOICE_BIC : '',
      process.env.INVOICE_ACCOUNT_HOLDER ? 'Kontoinhaber: ' + process.env.INVOICE_ACCOUNT_HOLDER : '',
      process.env.INVOICE_BANK ? 'Bank: ' + process.env.INVOICE_BANK : '',
      process.env.INVOICE_PAYPAL_EMAIL ? 'PayPal: ' + process.env.INVOICE_PAYPAL_EMAIL : ''
    ].filter(Boolean).join('\n');

    const pdfBuffer = await invoiceResendBuildPdf(invoice);
    const safeInvoiceNo = invoiceResendSafeFileName(invoice.invNo || 'rechnung');
    const filename = safeInvoiceNo + '.pdf';
    const pdfPath = path.join(INVOICE_RESEND_DIR, filename);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const title = invoiceResendTitle(invoice.kind);
    const subject = title + ' ' + (invoice.invNo || '');
    const total = invoiceResendMoney(invoice.total || 0);
    const paymentText = invoiceResendPaymentText(invoice);
    const body = 'Hallo ' + invoiceResendText(invoice.customerName || '', 120) + ',\n\n' +
      'anbei erhältst du ' + (invoice.kind === 'cash' ? 'deine Barquittung' : 'deine Rechnung') + ' ' + invoiceResendText(invoice.invNo || '', 80) + '.\n\n' +
      'Gesamtbetrag: ' + total + '\n' + paymentText + '\n\n' +
      'Viele Grüße\n' + invoiceResendText(invoice.companyName || 'GrünWerk Gartenbau', 120);

    const from = process.env.RESEND_FROM || process.env.MAIL_FROM || 'GrünWerk Gartenbau <service@gruenwerk-gartenservice.de>';
    const replyTo = process.env.REPLY_TO_EMAIL || process.env.MAIL_FROM || process.env.RESEND_FROM || 'service@gruenwerk-gartenservice.de';

    const resendResult = await invoiceResendSendMail({ from, to, subject, text: body, pdfBuffer, filename, replyTo });

    if (typeof addActivity === 'function') addActivity(req, 'invoice_email_sent_resend', { invoice: invoice.invNo, to, filename, resendId: resendResult.id || '' });
    res.json({ ok: true, filename, resendId: resendResult.id || '', downloadUrl: '/admin/invoice-files/' + encodeURIComponent(filename) });
  } catch (error) {
    console.error('[INVOICE] Resend Versand fehlgeschlagen:', error);
    res.status(500).json({ ok: false, error: error.message || 'Rechnung konnte nicht gesendet werden.' });
  }
});

app.get('/admin/invoice-files/:filename', requireLogin, (req, res) => {
  const safe = invoiceResendSafeFileName(req.params.filename || '');
  if (!safe.endsWith('.pdf')) return res.status(404).send('Datei nicht gefunden.');
  const filePath = path.join(INVOICE_RESEND_DIR, safe);
  if (!filePath.startsWith(INVOICE_RESEND_DIR) || !fs.existsSync(filePath)) return res.status(404).send('Datei nicht gefunden.');
  res.download(filePath, safe);
});
// === INVOICE RESEND SERVER END ===
`;

  const listenIndex = server.lastIndexOf('app.listen(');
  if (listenIndex === -1) throw new Error('app.listen wurde nicht gefunden.');
  server = server.slice(0, listenIndex) + routeBlock + '\n\n' + server.slice(listenIndex);

  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies.pdfkit = pkg.dependencies.pdfkit || '^0.15.0';
  // nodemailer wird für Resend nicht benötigt. Falls es schon drin ist, bleibt es unkritisch stehen.

  fs.writeFileSync(SERVER, server, 'utf8');
  fs.writeFileSync(PACKAGE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  execSync('node --check server.js', { cwd: ROOT, stdio: 'pipe' });
  console.log('\n✅ server.js ist syntaktisch gültig.');
  console.log('✅ Rechnungsversand wurde von SMTP auf Resend umgestellt.');
  console.log('\nNächste Schritte:');
  console.log('1) npm install');
  console.log('2) git add .');
  console.log('3) git commit -m "Rechnungen per Resend senden"');
  console.log('4) git push');
} catch (error) {
  console.error('\n❌ Fehler beim Einbauen:', error.message);
  restore(SERVER, serverBackup);
  restore(PACKAGE, packageBackup);
  process.exit(1);
}
