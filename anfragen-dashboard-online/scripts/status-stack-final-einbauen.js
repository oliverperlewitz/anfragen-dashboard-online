const fs = require('fs');
const path = require('path');

const adminPath = path.join(process.cwd(), 'views', 'admin.ejs');
if (!fs.existsSync(adminPath)) {
  console.error('❌ views/admin.ejs nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

const backupPath = adminPath + '.backup-before-status-stack-final';
if (!fs.existsSync(backupPath)) fs.copyFileSync(adminPath, backupPath);

let html = fs.readFileSync(adminPath, 'utf8');

// Alte fehlgeschlagene Force-Fixes entfernen, damit sie nicht mehr stören.
html = html
  .replace(/\s*<link[^>]+href=["']\/status-actions\.css["'][^>]*>/g, '')
  .replace(/\s*<script[^>]+src=["']\/status-templates\.js["'][^>]*><\/script>/g, '')
  .replace(/\s*<link[^>]+href=["']\/status-stack-force\.css["'][^>]*>/g, '')
  .replace(/\s*<script[^>]+src=["']\/status-stack-force\.js["'][^>]*><\/script>/g, '')
  .replace(/\s*<link[^>]+href=["']\/status-stack-final\.css["'][^>]*>/g, '')
  .replace(/\s*<script[^>]+src=["']\/status-stack-final\.js["'][^>]*><\/script>/g, '');

if (!html.includes('/status-stack-final.css')) {
  if (html.includes('</head>')) {
    html = html.replace('</head>', '  <link rel="stylesheet" href="/status-stack-final.css">\n</head>');
  } else {
    console.error('❌ </head> nicht gefunden.');
    process.exit(1);
  }
}

if (!html.includes('/status-stack-final.js')) {
  if (html.includes('</body>')) {
    html = html.replace('</body>', '  <script src="/status-stack-final.js" defer></script>\n</body>');
  } else {
    html += '\n<script src="/status-stack-final.js" defer></script>\n';
  }
}

fs.writeFileSync(adminPath, html);
console.log('✅ Statusbereich-Final-Fix eingebaut.');
console.log('Backup:', backupPath);
