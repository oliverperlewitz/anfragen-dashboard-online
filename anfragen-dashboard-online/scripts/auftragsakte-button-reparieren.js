const fs = require('fs');
const path = require('path');

const root = process.cwd();
const adminPath = path.join(root, 'views', 'admin.ejs');
const cssPath = path.join(root, 'public', 'style.css');
const serverPath = path.join(root, 'server.js');
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

function ensureArchiveRoute() {
  if (!fs.existsSync(serverPath)) return;
  const server = read(serverPath);
  const hasRoute = server.includes('/admin/requests/:id/archive.zip') || server.includes('Auftragsakte / Nachweis-ZIP');
  if (!hasRoute) {
    console.warn('\nWARNUNG: Die Auftragsakte-Route wurde in server.js nicht gefunden.');
    console.warn('Bitte zuerst ausführen: node scripts/auftragsakte-einbauen.js');
    console.warn('Danach dieses Reparatur-Script nochmal ausführen.\n');
  } else {
    console.log('Auftragsakte-Route in server.js gefunden.');
  }
}

function patchAdmin() {
  backup(adminPath, 'auftragsakte-button-fix');
  let admin = read(adminPath);

  if (admin.includes('/admin/requests/<%= a.id %>/archive.zip') || admin.includes('Auftragsakte herunterladen')) {
    console.log('Der Auftragsakte-Button ist bereits in views/admin.ejs vorhanden.');
    return;
  }

  const panel = `\n                    <details class="archive-lite-panel" open>\n                      <summary>Nachweis & Archiv</summary>\n                      <p>Alle wichtigen Auftragsdaten, Rechnung, Fotos, Notizen, Kundenantworten und Statusverlauf als ZIP herunterladen.</p>\n                      <a class="button secondary archive-download-button" href="/admin/requests/<%= a.id %>/archive.zip">📦 Auftragsakte herunterladen</a>\n                    </details>\n`;

  const replacements = [
    { name: 'vor Status-Aktionen', regex: /(\n\s*<div[^>]*class="[^"]*admin-card-actions[^"]*"[^>]*>)/ },
    { name: 'vor Status ändern', regex: /(\n\s*<details[^>]*>\s*\n\s*<summary>\s*Status ändern)/ },
    { name: 'nach Zahlung & Rechnung', regex: /(\n\s*<details[^>]*class="[^"]*invoice-lite-panel[^"]*"[\s\S]*?<\/details>)/ },
    { name: 'direkt im geöffneten Auftrag', regex: /(\n\s*<div[^>]*class="[^"]*request-expanded-content[^"]*"[^>]*>)/ }
  ];

  for (const option of replacements) {
    if (option.regex.test(admin)) {
      admin = admin.replace(option.regex, `$1${panel}`);
      write(adminPath, admin);
      console.log(`Auftragsakte-Button eingefügt: ${option.name}`);
      return;
    }
  }

  throw new Error('Keine passende Stelle in views/admin.ejs gefunden. Bitte admin.ejs hochladen, dann kann ich es direkt einbauen.');
}

function patchCss() {
  if (!fs.existsSync(cssPath)) return;
  backup(cssPath, 'auftragsakte-button-fix');
  let css = read(cssPath);
  if (css.includes('archive-download-button')) {
    console.log('Archiv-Styles sind bereits vorhanden.');
    return;
  }
  css += `\n\n/* Auftragsakte / Nachweis-ZIP */\n.archive-lite-panel {\n  border: 1px solid rgba(22, 78, 48, .14);\n  background: #f8fbf4;\n  border-radius: 18px;\n  padding: 12px 14px;\n  margin: 12px 0;\n}\n.archive-lite-panel summary {\n  cursor: pointer;\n  font-weight: 900;\n  color: #143820;\n}\n.archive-lite-panel p {\n  margin: 8px 0 10px;\n  color: #5d6d5d;\n  font-size: .9rem;\n  line-height: 1.45;\n}\n.archive-download-button {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 8px;\n  text-decoration: none;\n  border-radius: 999px;\n  font-weight: 900;\n  padding: 10px 14px;\n}\n`;
  write(cssPath, css);
  console.log('Archiv-Styles in public/style.css ergänzt.');
}

try {
  ensureArchiveRoute();
  patchAdmin();
  patchCss();
  console.log('\nFertig. Jetzt ausführen:');
  console.log('git add .');
  console.log('git commit -m "Auftragsakte Button repariert"');
  console.log('git push');
} catch (error) {
  console.error('\nFehler:', error.message);
  process.exit(1);
}
