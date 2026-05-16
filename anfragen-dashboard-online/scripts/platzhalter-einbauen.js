const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'views', 'kontakt.ejs');

if (!fs.existsSync(filePath)) {
  console.error('Fehler: views/kontakt.ejs wurde nicht gefunden. Bitte im Projektordner ausführen.');
  process.exit(1);
}

let content = fs.readFileSync(filePath, 'utf8');
const original = content;

const cssLine = '  <link rel="stylesheet" href="/placeholder-scroll.css">';
const jsLine = '  <script src="/placeholder-scroll.js" defer></script>';

if (!content.includes('/placeholder-scroll.css')) {
  if (content.includes('</head>')) {
    content = content.replace('</head>', `${cssLine}\n</head>`);
  } else {
    console.error('Fehler: </head> wurde in views/kontakt.ejs nicht gefunden.');
    process.exit(1);
  }
}

if (!content.includes('/placeholder-scroll.js')) {
  if (content.includes('</body>')) {
    content = content.replace('</body>', `${jsLine}\n</body>`);
  } else {
    console.error('Fehler: </body> wurde in views/kontakt.ejs nicht gefunden.');
    process.exit(1);
  }
}

if (content !== original) {
  const backupPath = filePath + '.backup-before-placeholder';
  if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, original, 'utf8');
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Fertig: placeholder-scroll.css und placeholder-scroll.js wurden in views/kontakt.ejs eingebunden.');
  console.log('Backup erstellt:', backupPath);
} else {
  console.log('Nichts geändert: Die Platzhalter-Dateien waren bereits eingebunden.');
}
