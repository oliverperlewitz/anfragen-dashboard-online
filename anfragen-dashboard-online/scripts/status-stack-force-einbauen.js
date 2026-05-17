const fs = require('fs');
const path = require('path');

const adminPath = path.join(process.cwd(), 'views', 'admin.ejs');
if (!fs.existsSync(adminPath)) {
  console.error('views/admin.ejs wurde nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

const backupPath = path.join(process.cwd(), 'views', `admin.ejs.backup-before-status-stack-${Date.now()}`);
fs.copyFileSync(adminPath, backupPath);

let html = fs.readFileSync(adminPath, 'utf8');

if (!html.includes('/status-stack-force.css')) {
  if (html.includes('</head>')) {
    html = html.replace('</head>', '  <link rel="stylesheet" href="/status-stack-force.css">\n</head>');
  } else {
    console.error('</head> wurde nicht gefunden. CSS konnte nicht automatisch eingebaut werden.');
    process.exit(1);
  }
}

if (!html.includes('/status-stack-force.js')) {
  if (html.includes('</body>')) {
    html = html.replace('</body>', '  <script src="/status-stack-force.js" defer></script>\n</body>');
  } else {
    console.error('</body> wurde nicht gefunden. JS konnte nicht automatisch eingebaut werden.');
    process.exit(1);
  }
}

fs.writeFileSync(adminPath, html);
console.log('✅ Statusbereich wird jetzt per CSS/JS untereinander angeordnet.');
console.log('Backup erstellt:', backupPath);
