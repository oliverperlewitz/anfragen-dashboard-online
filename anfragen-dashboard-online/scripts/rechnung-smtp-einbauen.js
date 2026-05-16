const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const SERVER = path.join(ROOT, 'server.js');
const PACKAGE = path.join(ROOT, 'package.json');
const BACKUP_SUFFIX = 'backup-before-invoice-smtp';

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

if (!fs.existsSync(SERVER)) fail('server.js wurde nicht gefunden. Bitte im Projektordner ausführen.');
if (!fs.existsSync(PACKAGE)) fail('package.json wurde nicht gefunden. Bitte im Projektordner ausführen.');

const serverBackup = backup(SERVER);
const packageBackup = backup(PACKAGE);

let server = fs.readFileSync(SERVER, 'utf8');
let pkg = JSON.parse(fs.readFileSync(PACKAGE, 'utf8'));

try {
  if (!server.includes("require('nodemailer')") && !server.includes('require("nodemailer")')) {
    const requireAnchor = "const bcrypt = require('bcryptjs');";
    if (server.includes(requireAnchor)) {
      server = server.replace(requireAnchor, requireAnchor + "\nconst nodemailer = require('nodemailer');");
    } else {
      const appAnchor = "const app = express();";
      if (!server.includes(appAnchor)) throw new Error('Konnte require-Bereich nicht finden.');
      server = server.replace(appAnchor, "const nodemailer = require('nodemailer');\n" + appAnchor);
    }
  }

  if (!server.includes("require('pdfkit')") && !server.includes('require("pdfkit")')) {
    const mailAnchor = "const nodemailer = require('nodemailer');";
    if (server.includes(mailAnchor)) {
      server = server.replace(mailAnchor, mailAnchor + "\nconst PDFDocument = require('pdfkit');");
    } else {
      throw new Error('Konnte pdfkit require nicht einfügen.');
    }
  }

  const marker = '// === INVOICE SMTP SERVER START ===';
  if (!server.includes(marker)) {
    const routeBlock = String.raw`

${marker}
const INVOICE_SMTP_DIR = path.join(DATA_DIR, 'invoices');
if (!fs.existsSync(INVOICE_SMTP_DIR)) fs.mkdirSync(INVOICE_SMTP_DIR, { recursive: true });

function invoiceSmtpText(value, max = 1000) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

function invoiceSmtpMoney(value) {
  const number = Number(value || 0) || 0;
  return number.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function invoiceSmtpGermanDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toLocaleDateString('de-DE');
  return date.toLocaleDateString('de-DE');
}

function invoiceSmtpSafeFileName(value) {
  return String(value || 'rechnung').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'rechnung';
}

function invoiceSmtpTitle(kind) {
  if (kind === 'cash') return 'BARRECHNUNG / QUITTUNG';
  if (kind === 'paypal') return 'RECHNUNG / PAYPAL';
  if (kind === 'card') return 'RECHNUNG / KARTENZAHLUNG';
  return 'RECHNUNG';
}

function invoiceSmtpPaymentText(invoice) {
  const kind = invoice.kind || 'invoice';
  if (kind === 'cash') return 'Betrag dankend bar erhalten am ' + invoiceSmtpGermanDate(invoice.invDate) + '.';
  if (kind === 'paypal') return 'Zahlungsart: PayPal. Bitte zahle den Betrag per PayPal' + (invoice.paypalEmail ? ' an ' + invoice.paypalEmail : '') + '. Verwendungszweck: ' + invoice.invNo;
  if (kind === 'card') return 'Zahlungsart: Kartenzahlung / Sonstiges.';
  return 'Bitte überweise den Betrag innerhalb von 14 Tagen. Verwendungszweck: ' + invoice.invNo;
}

function invoiceSmtpBuildPdf(invoice) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const green = '#123b25';
    const muted = '#5d6c5c';
    const light = '#f4f7ef';
    const title = invoiceSmtpTitle(invoice.kind);
    const companyName = invoiceSmtpText(invoice.companyName || 'GrünWerk Gartenbau', 120);
    const companyAddress = invoiceSmtpText(invoice.companyAddress || process.env.INVOICE_COMPANY_ADDRESS || '', 500);
    const paymentText = invoiceSmtpPaymentText(invoice);
    const rows = Array.isArray(invoice.rows) ? invoice.rows : [];
    const total = Number(invoice.total || rows.reduce((sum, row) => sum + Number(row.total || 0), 0)) || 0;

    doc.fillColor(green).fontSize(24).text(companyName, 48, 48, { width: 270 });
    doc.fillColor(muted).fontSize(10).text(companyAddress || 'Firmenadresse in Render Environment hinterlegen', 48, 82, { width: 260, lineGap: 3 });

    doc.fillColor(green).fontSize(11).text('Rechnungsnummer', 360, 50, { align: 'right' });
    doc.fillColor('#111111').fontSize(14).text(invoiceSmtpText(invoice.invNo || 'RG', 80), 360, 66, { align: 'right' });
    doc.fillColor(muted).fontSize(10).text('Datum: ' + invoiceSmtpGermanDate(invoice.invDate), 360, 88, { align: 'right' });
    doc.text('Leistungsdatum: ' + invoiceSmtpGermanDate(invoice.serviceDate), 360, 103, { align: 'right' });
    doc.text('Ticket: ' + invoiceSmtpText(invoice.ticket || '-', 80), 360, 118, { align: 'right' });

    doc.roundedRect(48, 145, 500, 5, 2).fill(green);
    doc.fillColor(green).fontSize(26).text(title, 48, 172);

    doc.roundedRect(48, 215, 230, 105, 14).fill(light);
    doc.roundedRect(318, 215, 230, 105, 14).fill(light);
    doc.fillColor(muted).fontSize(9).text('RECHNUNG AN', 66, 232);
    doc.fillColor('#111111').fontSize(12).text(invoiceSmtpText(invoice.customerName || 'Kunde', 120), 66, 250, { width: 190 });
    doc.fillColor('#333333').fontSize(10).text(invoiceSmtpText(invoice.customerAddress || '', 260), 66, 268, { width: 190, lineGap: 3 });
    doc.fillColor(muted).fontSize(9).text('ZAHLUNG', 336, 232);
    doc.fillColor('#111111').fontSize(10).text(invoiceSmtpText(paymentText, 300), 336, 250, { width: 190, lineGap: 4 });

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
      const description = invoiceSmtpText(row.description || 'Leistung', 240);
      const qty = Number(row.qty || 1) || 1;
      const price = Number(row.price || 0) || 0;
      const rowTotal = Number(row.total || qty * price) || 0;
      doc.fillColor('#111111').fontSize(10).text(String(index + 1), 60, y);
      doc.text(description, 100, y, { width: 215 });
      doc.text(String(qty).replace('.', ','), 340, y, { width: 50, align: 'right' });
      doc.text(invoiceSmtpMoney(price), 405, y, { width: 55, align: 'right' });
      doc.text(invoiceSmtpMoney(rowTotal), 480, y, { width: 55, align: 'right' });
      y += Math.max(28, doc.heightOfString(description, { width: 215 }) + 12);
      doc.moveTo(48, y - 7).lineTo(548, y - 7).strokeColor('#e2e8dc').lineWidth(1).stroke();
    });

    y += 8;
    doc.roundedRect(318, y, 230, 54, 16).fill(green);
    doc.fillColor('#d9e8d6').fontSize(10).text('GESAMTBETRAG', 338, y + 13);
    doc.fillColor('#ffffff').fontSize(20).text(invoiceSmtpMoney(total), 338, y + 28, { width: 190, align: 'right' });
    y += 84;

    if (y > 650) { doc.addPage(); y = 60; }
    doc.roundedRect(48, y, 500, 82, 14).fill('#f1f7ed');
    doc.fillColor(green).fontSize(13).text('Zahlungsdaten', 66, y + 16);
    doc.fillColor('#111111').fontSize(10).text(invoiceSmtpText(invoice.paymentDetails || invoice.iban || paymentText, 600), 66, y + 36, { width: 460, lineGap: 3 });
    y += 108;

    doc.fillColor(green).fontSize(12).text('Hinweis', 48, y);
    doc.fillColor(muted).fontSize(9).text(invoiceSmtpText(invoice.legal || '', 600), 48, y + 18, { width: 500, lineGap: 3 });
    doc.text(invoiceSmtpText(invoice.footer || process.env.INVOICE_FOOTER || 'Vielen Dank für deinen Auftrag.', 400), 48, y + 58, { width: 500 });
    doc.end();
  });
}

function invoiceSmtpTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.strato.de';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true') === 'true';
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) throw new Error('SMTP_USER oder SMTP_PASS fehlt in Render Environment.');
  return nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
}

app.post('/admin/invoice/send', requireLogin, verifyCsrf, async (req, res) => {
  try {
    const invoice = JSON.parse(String(req.body.invoiceData || '{}'));
    const to = invoiceSmtpText(invoice.customerEmail, 200);
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

    const pdfBuffer = await invoiceSmtpBuildPdf(invoice);
    const safeInvoiceNo = invoiceSmtpSafeFileName(invoice.invNo || 'rechnung');
    const filename = safeInvoiceNo + '.pdf';
    const pdfPath = path.join(INVOICE_SMTP_DIR, filename);
    fs.writeFileSync(pdfPath, pdfBuffer);

    const transporter = invoiceSmtpTransporter();
    const from = process.env.SMTP_FROM || process.env.MAIL_FROM || process.env.RESEND_FROM || process.env.SMTP_USER;
    const title = invoiceSmtpTitle(invoice.kind);
    const subject = title + ' ' + (invoice.invNo || '');
    const total = invoiceSmtpMoney(invoice.total || 0);
    const paymentText = invoiceSmtpPaymentText(invoice);
    const body = 'Hallo ' + invoiceSmtpText(invoice.customerName || '', 120) + ',\n\n' +
      'anbei erhältst du ' + (invoice.kind === 'cash' ? 'deine Barquittung' : 'deine Rechnung') + ' ' + invoiceSmtpText(invoice.invNo || '', 80) + '.\n\n' +
      'Gesamtbetrag: ' + total + '\n' + paymentText + '\n\n' +
      'Viele Grüße\n' + invoiceSmtpText(invoice.companyName || 'GrünWerk Gartenbau', 120);

    await transporter.sendMail({
      from,
      to,
      subject,
      text: body,
      attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }]
    });

    if (typeof addActivity === 'function') addActivity(req, 'invoice_email_sent', { invoice: invoice.invNo, to, filename });
    res.json({ ok: true, filename, downloadUrl: '/admin/invoice-files/' + encodeURIComponent(filename) });
  } catch (error) {
    console.error('[INVOICE] Versand fehlgeschlagen:', error);
    res.status(500).json({ ok: false, error: error.message || 'Rechnung konnte nicht gesendet werden.' });
  }
});

app.get('/admin/invoice-files/:filename', requireLogin, (req, res) => {
  const safe = invoiceSmtpSafeFileName(req.params.filename || '');
  if (!safe.endsWith('.pdf')) return res.status(404).send('Datei nicht gefunden.');
  const filePath = path.join(INVOICE_SMTP_DIR, safe);
  if (!filePath.startsWith(INVOICE_SMTP_DIR) || !fs.existsSync(filePath)) return res.status(404).send('Datei nicht gefunden.');
  res.download(filePath, safe);
});
// === INVOICE SMTP SERVER END ===
`;
    const listenIndex = server.lastIndexOf('app.listen(');
    if (listenIndex === -1) throw new Error('app.listen wurde nicht gefunden.');
    server = server.slice(0, listenIndex) + routeBlock + '\n\n' + server.slice(listenIndex);
  } else {
    console.log('SMTP-Rechnungsroute ist bereits eingebaut.');
  }

  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies.nodemailer = pkg.dependencies.nodemailer || '^6.9.15';
  pkg.dependencies.pdfkit = pkg.dependencies.pdfkit || '^0.15.0';

  fs.writeFileSync(SERVER, server, 'utf8');
  fs.writeFileSync(PACKAGE, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  execSync('node --check server.js', { cwd: ROOT, stdio: 'pipe' });
  console.log('\n✅ server.js ist syntaktisch gültig.');
  console.log('✅ Rechnungsversand über SMTP wurde eingebaut.');
  console.log('\nNächste Schritte:');
  console.log('1) npm install');
  console.log('2) git add .');
  console.log('3) git commit -m "Rechnung per STRATO SMTP senden"');
  console.log('4) git push');
} catch (error) {
  console.error('\n❌ Fehler beim Einbauen:', error.message);
  restore(SERVER, serverBackup);
  restore(PACKAGE, packageBackup);
  process.exit(1);
}
