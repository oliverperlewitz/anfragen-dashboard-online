const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = process.cwd();
const serverPath = path.join(root, 'server.js');

if (!fs.existsSync(serverPath)) {
  console.error('server.js wurde nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

const backupPath = `${serverPath}.backup-before-zahlungswunsch-crash-fix`;
if (!fs.existsSync(backupPath)) fs.copyFileSync(serverPath, backupPath);

let server = fs.readFileSync(serverPath, 'utf8');
let changed = false;

// 1) Make sure validateRequestForm reads the field from the form.
if (!server.includes('zahlungswunsch: cleanText(body.zahlungswunsch')) {
  server = server.replace(
    /(kontaktart:\s*cleanText\(body\.kontaktart,\s*80\),?)/,
    `$1\n    zahlungswunsch: cleanText(body.zahlungswunsch, 80),`
  );
  changed = true;
}

// 2) The crash happened because server.js uses ${zahlungswunsch} but no variable exists.
// Add a safe local variable in the /anfrage route right before budgetText is built.
if (server.includes('Zahlungswunsch: ${zahlungswunsch') && !server.includes('const zahlungswunsch = data.zahlungswunsch ||')) {
  const marker = '  const budgetText';
  if (server.includes(marker)) {
    server = server.replace(marker, "  const zahlungswunsch = data.zahlungswunsch || '';\n\n" + marker);
    changed = true;
  } else {
    console.error('Konnte die Stelle fuer const budgetText nicht finden. server.js wurde nicht geaendert.');
    process.exit(1);
  }
}

// 3) Make sure the created request safely stores the value.
if (server.includes('Zahlungswunsch: ${zahlungswunsch') && !server.includes('zahlungswunsch: zahlungswunsch ||')) {
  server = server.replace(
    /(kontaktart:\s*kontaktart \|\| '',?)/,
    `$1\n    zahlungswunsch: zahlungswunsch || '',`
  );
  changed = true;
}

fs.writeFileSync(serverPath, server);

try {
  execSync(`node -c "${serverPath}"`, { stdio: 'pipe' });
} catch (error) {
  fs.copyFileSync(backupPath, serverPath);
  console.error('server.js hatte nach dem Fix einen Syntaxfehler. Backup wurde wiederhergestellt.');
  console.error(String(error.stdout || error.stderr || error.message));
  process.exit(1);
}

console.log(changed ? 'Zahlungswunsch-Crash wurde behoben.' : 'Keine Änderung nötig. server.js ist syntaktisch gültig.');
console.log('Jetzt: git add . && git commit -m "Zahlungswunsch Fehler behoben" && git push');
