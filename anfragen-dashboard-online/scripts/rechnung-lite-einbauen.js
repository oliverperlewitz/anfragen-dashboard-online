const fs = require('fs');
const path = require('path');

const root = process.cwd();
const adminPath = path.join(root, 'views', 'admin.ejs');

if (!fs.existsSync(adminPath)) {
  console.error('views/admin.ejs wurde nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

let admin = fs.readFileSync(adminPath, 'utf8');
const backup = path.join(root, 'views', 'admin.ejs.backup-before-invoice-lite');
if (!fs.existsSync(backup)) fs.writeFileSync(backup, admin);

let changed = false;
if (!admin.includes('/invoice-lite.css')) {
  if (admin.includes('</head>')) {
    admin = admin.replace('</head>', '  <link rel="stylesheet" href="/invoice-lite.css">\n</head>');
    changed = true;
  } else {
    console.error('Kein </head> in views/admin.ejs gefunden.');
    process.exit(1);
  }
}

if (!admin.includes('/invoice-lite.js')) {
  if (admin.includes('</body>')) {
    admin = admin.replace('</body>', '  <script src="/invoice-lite.js" defer></script>\n</body>');
    changed = true;
  } else {
    console.error('Kein </body> in views/admin.ejs gefunden.');
    process.exit(1);
  }
}

fs.writeFileSync(adminPath, admin);
console.log(changed ? 'Rechnung-Lite wurde in views/admin.ejs eingebunden.' : 'Rechnung-Lite war bereits eingebunden.');
console.log('Backup:', path.relative(root, backup));
