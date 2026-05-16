const fs = require('fs');
const path = require('path');

const root = process.cwd();
const adminPath = path.join(root, 'views', 'admin.ejs');
const cssPath = path.join(root, 'public', 'status-actions.css');
const jsPath = path.join(root, 'public', 'status-templates.js');

function die(message) {
  console.error('❌ ' + message);
  process.exit(1);
}

if (!fs.existsSync(adminPath)) die('views/admin.ejs wurde nicht gefunden. Bitte im Projektordner ausführen.');
if (!fs.existsSync(cssPath)) die('public/status-actions.css fehlt. Bitte ZIP vollständig entpacken.');
if (!fs.existsSync(jsPath)) die('public/status-templates.js fehlt. Bitte ZIP vollständig entpacken.');

const backupPath = adminPath + '.backup-before-status-layout';
if (!fs.existsSync(backupPath)) fs.copyFileSync(adminPath, backupPath);

let admin = fs.readFileSync(adminPath, 'utf8');
let changed = false;

if (!admin.includes('/status-actions.css')) {
  if (admin.includes('</head>')) {
    admin = admin.replace('</head>', '  <link rel="stylesheet" href="/status-actions.css">\n</head>');
    changed = true;
  } else {
    die('</head> wurde in views/admin.ejs nicht gefunden.');
  }
}

if (!admin.includes('/status-templates.js')) {
  if (admin.includes('</body>')) {
    admin = admin.replace('</body>', '  <script src="/status-templates.js" defer></script>\n</body>');
    changed = true;
  } else {
    die('</body> wurde in views/admin.ejs nicht gefunden.');
  }
}

fs.writeFileSync(adminPath, admin);
console.log(changed ? '✅ Status-Layout und Vorlagen wurden eingebunden.' : 'ℹ️ Status-Layout und Vorlagen waren bereits eingebunden.');
console.log('Backup:', path.relative(root, backupPath));
