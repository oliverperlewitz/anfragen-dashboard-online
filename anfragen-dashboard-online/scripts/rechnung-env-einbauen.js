const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('server.js wurde nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

let server = fs.readFileSync(serverPath, 'utf8');
const backupPath = path.join(root, 'server.js.backup-before-invoice-env');
if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, server);

if (server.includes("/admin/invoice-settings")) {
  console.log('Invoice-Settings-Route ist bereits eingebaut. Nichts zu tun.');
  process.exit(0);
}

const route = `
// Rechnung-Lite: Bankdaten sicher aus Render Environment Variables laden.
app.get('/admin/invoice-settings', (req, res) => {
  if (!req.session || !req.session.loggedIn) return res.status(401).json({ ok: false });
  res.json({
    companyName: process.env.INVOICE_COMPANY_NAME || 'GrünWerk Gartenbau',
    companyAddress: process.env.INVOICE_COMPANY_ADDRESS || '',
    iban: process.env.INVOICE_IBAN || '',
    bic: process.env.INVOICE_BIC || '',
    accountHolder: process.env.INVOICE_ACCOUNT_HOLDER || '',
    bank: process.env.INVOICE_BANK || '',
    footer: process.env.INVOICE_FOOTER || 'Vielen Dank für deinen Auftrag.'
  });
});

`;

const anchors = ["app.get('/',", 'app.get("/",'];
let inserted = false;
for (const anchor of anchors) {
  const index = server.indexOf(anchor);
  if (index !== -1) {
    server = server.slice(0, index) + route + server.slice(index);
    inserted = true;
    break;
  }
}

if (!inserted) {
  console.error("Konnte die Stelle vor app.get('/') nicht finden. Keine Änderung gemacht.");
  process.exit(1);
}

fs.writeFileSync(serverPath, server);

try {
  execSync(`node -c "${serverPath}"`, { stdio: 'pipe' });
  console.log('Rechnungs-Environment-Route wurde eingebaut. Syntaxprüfung erfolgreich.');
  console.log('Backup:', path.relative(root, backupPath));
} catch (error) {
  fs.writeFileSync(serverPath, fs.readFileSync(backupPath, 'utf8'));
  console.error('Syntaxprüfung fehlgeschlagen. server.js wurde aus Backup wiederhergestellt.');
  console.error(String(error.stderr || error.message));
  process.exit(1);
}
