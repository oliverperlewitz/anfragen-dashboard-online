const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');
const kontaktPath = path.join(root, 'views', 'kontakt.ejs');
const adminPath = path.join(root, 'views', 'admin.ejs');

function exists(file) {
  if (!fs.existsSync(file)) {
    console.error(`${path.relative(root, file)} wurde nicht gefunden. Bitte im Projektordner ausführen.`);
    process.exit(1);
  }
}

function backup(file, label) {
  const backupPath = `${file}.backup-before-${label}`;
  if (!fs.existsSync(backupPath)) fs.copyFileSync(file, backupPath);
  return backupPath;
}

function write(file, content) {
  fs.writeFileSync(file, content);
}

function patchServer() {
  exists(serverPath);
  let server = fs.readFileSync(serverPath, 'utf8');
  backup(serverPath, 'payment-wish');
  let changed = false;

  if (!server.includes('zahlungswunsch: cleanText(body.zahlungswunsch')) {
    server = server.replace(
      /kontaktart:\s*cleanText\(body\.kontaktart,\s*80\),?/,
      match => `${match}\n    zahlungswunsch: cleanText(body.zahlungswunsch, 80),`
    );
    changed = true;
  }

  if (!server.includes('data.zahlungswunsch')) {
    server = server.replace(
      /data\.kontaktart\s*\n\s*\]/,
      `data.kontaktart,\n    data.zahlungswunsch\n  ]`
    );
    changed = true;
  }

  if (!/kontaktart,\s*\n\s*zahlungswunsch/.test(server)) {
    server = server.replace(/kontaktart\s*\n\s*}\s*=\s*data;/, `kontaktart,\n    zahlungswunsch\n  } = data;`);
    changed = true;
  }

  if (!/kontaktart,\s*\n\s*zahlungswunsch\s*\n\s*}\);/.test(server)) {
    server = server.replace(/kontaktart\s*\n\s*}\);/, `kontaktart,\n    zahlungswunsch\n  });`);
    changed = true;
  }

  if (!server.includes('Zahlungswunsch: ${zahlungswunsch')) {
    server = server.replace(
      /`Bevorzugte Kontaktart:\s*\$\{kontaktart \|\| '-'\}`,?/,
      match => `${match}\n    \`Zahlungswunsch: \${zahlungswunsch || '-'}\`,`
    );
    changed = true;
  }

  if (!server.includes('zahlungswunsch: zahlungswunsch ||')) {
    server = server.replace(
      /kontaktart:\s*kontaktart \|\| '',?/,
      match => `${match}\n    zahlungswunsch: zahlungswunsch || '',`
    );
    changed = true;
  }

  if (server.includes('function rebuildRequestMessage') && !server.includes('Zahlungswunsch: ${anfrage.zahlungswunsch')) {
    server = server.replace(
      /`Bevorzugte Kontaktart:\s*\$\{anfrage\.kontaktart \|\| '-'\}`,?/,
      match => `${match}\n    \`Zahlungswunsch: \${anfrage.zahlungswunsch || '-'}\`,`
    );
    changed = true;
  }

  // Invoice settings route: add PayPal email if route exists.
  if (server.includes('/admin/invoice-settings') && !server.includes('paypalEmail')) {
    server = server.replace(
      /bank:\s*process\.env\.INVOICE_BANK \|\| '',?/,
      match => `${match}\n      paypalEmail: process.env.INVOICE_PAYPAL_EMAIL || process.env.PAYPAL_EMAIL || '',`
    );
    changed = true;
  }

  write(serverPath, server);
  try {
    execSync(`node -c "${serverPath}"`, { stdio: 'pipe' });
  } catch (error) {
    const restore = `${serverPath}.backup-before-payment-wish`;
    if (fs.existsSync(restore)) fs.copyFileSync(restore, serverPath);
    console.error('server.js hatte nach dem Einbau einen Syntaxfehler. Backup wurde wiederhergestellt.');
    console.error(String(error.stdout || error.stderr || error.message));
    process.exit(1);
  }
  console.log(changed ? 'server.js: Zahlungswunsch eingebaut.' : 'server.js: Zahlungswunsch war bereits eingebaut.');
}

function patchKontakt() {
  exists(kontaktPath);
  let kontakt = fs.readFileSync(kontaktPath, 'utf8');
  backup(kontaktPath, 'payment-wish');
  if (kontakt.includes('name="zahlungswunsch"')) {
    console.log('views/kontakt.ejs: Zahlungswunsch war bereits eingebaut.');
    return;
  }

  const paymentSelect = `
                <select name="zahlungswunsch">
                  <option value="">Wie möchtest du bezahlen? optional</option>
                  <option>Rechnung / Überweisung</option>
                  <option>Bar vor Ort</option>
                  <option>PayPal</option>
                  <option>Kartenzahlung / Sonstiges</option>
                  <option>Noch offen</option>
                </select>`;

  // Best case: after Kontaktart select block.
  const contactSelectRegex = /<select name="kontaktart">[\s\S]*?<\/select>/;
  if (contactSelectRegex.test(kontakt)) {
    kontakt = kontakt.replace(contactSelectRegex, match => `${match}${paymentSelect}`);
  } else {
    // fallback: before Datenschutz label
    kontakt = kontakt.replace(/<label class="gw-privacy">/, `${paymentSelect}\n\n          <label class="gw-privacy">`);
  }

  write(kontaktPath, kontakt);
  console.log('views/kontakt.ejs: Zahlungswunsch-Feld eingebaut.');
}

function patchAdmin() {
  exists(adminPath);
  let admin = fs.readFileSync(adminPath, 'utf8');
  backup(adminPath, 'payment-wish');
  let changed = false;

  if (!admin.includes('name="zahlungswunsch"') && admin.includes('name="kontaktart"')) {
    admin = admin.replace(
      /<input type="hidden" name="kontaktart" value="<%= a\.kontaktart \|\| getValueFrom\(a, 'Bevorzugte Kontaktart'\) \|\| '' %>">/,
      match => `${match}\n                        <input type="hidden" name="zahlungswunsch" value="<%= a.zahlungswunsch || getValueFrom(a, 'Zahlungswunsch') || '' %>">`
    );
    changed = true;
  }

  if (!admin.includes('Zahlungswunsch</span>')) {
    const paymentRow = `<div class="editable-data-row"><div><span>Zahlungswunsch</span><strong><%= a.zahlungswunsch || getValueFrom(a, 'Zahlungswunsch') || '-' %></strong></div><% if (permissions && permissions.canWriteNotes) { %><button type="button" class="inline-edit-pencil small" data-edit-form="request-inline-edit-<%= a.id %>" data-edit-field="zahlungswunsch" data-edit-label="Zahlungswunsch" data-edit-value="<%= a.zahlungswunsch || getValueFrom(a, 'Zahlungswunsch') || '' %>" aria-label="Zahlungswunsch bearbeiten">✎</button><% } %></div>`;

    // Insert after Kontaktart row in the modern dashboard.
    const kontaktRowRegex = /<div class="editable-data-row"><div><span>Kontaktart<\/span>[\s\S]*?<\/div>/;
    if (kontaktRowRegex.test(admin)) {
      admin = admin.replace(kontaktRowRegex, match => `${match}\n                            ${paymentRow}`);
      changed = true;
    } else {
      // fallback: add a small notice before details block inside request card.
      admin = admin.replace(
        /<details class="request-details-clean/,
        `<div class="payment-wish-box"><span>Zahlungswunsch</span><strong><%= a.zahlungswunsch || getValueFrom(a, 'Zahlungswunsch') || '-' %></strong></div>\n                    <details class="request-details-clean`
      );
      changed = true;
    }
  }

  // Add full edit form field if present.
  if (!admin.includes('<span>Zahlungswunsch</span><input name="zahlungswunsch"') && admin.includes('name="kontaktart"')) {
    admin = admin.replace(
      /<label><span>Kontaktart<\/span><input name="kontaktart" value="<%= a\.kontaktart \|\| getValueFrom\(a, 'Bevorzugte Kontaktart'\) \|\| '' %>"><\/label>/,
      match => `${match}\n                              <label><span>Zahlungswunsch</span><input name="zahlungswunsch" value="<%= a.zahlungswunsch || getValueFrom(a, 'Zahlungswunsch') || '' %>"></label>`
    );
    changed = true;
  }

  write(adminPath, admin);
  console.log(changed ? 'views/admin.ejs: Zahlungswunsch-Anzeige eingebaut.' : 'views/admin.ejs: keine Änderung nötig.');
}

patchServer();
patchKontakt();
patchAdmin();
console.log('\nFertig. Jetzt: git add . && git commit -m "Zahlungswunsch und PayPal hinzugefuegt" && git push');
