require('dotenv').config();

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'anfragen.json');
const ACTIVITY_LOG_FILE = path.join(DATA_DIR, 'activity-log.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Zu viele Login-Versuche. Bitte warte 15 Minuten und versuche es erneut.'
});

const formLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Zu viele Anfragen in kurzer Zeit. Bitte warte kurz und versuche es erneut.'
});

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');
if (!fs.existsSync(ACTIVITY_LOG_FILE)) fs.writeFileSync(ACTIVITY_LOG_FILE, '[]', 'utf8');

function readAnfragen() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

function writeAnfragen(anfragen) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(anfragen, null, 2), 'utf8');
}


function readJsonFile(filePath, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
}

function addActivity(req, action, details = {}) {
  const log = readJsonFile(ACTIVITY_LOG_FILE, []);
  log.unshift({
    id: crypto.randomUUID(),
    time: new Date().toISOString(),
    datum: new Date().toLocaleString('de-DE'),
    action,
    admin: req.session?.username || null,
    ip: getClientIp(req),
    details
  });

  writeJsonFile(ACTIVITY_LOG_FILE, log.slice(0, 500));
}

function readActivityLog(limit = 12) {
  return readJsonFile(ACTIVITY_LOG_FILE, []).slice(0, limit);
}

function pruneBackups() {
  const maxBackups = Number(process.env.MAX_BACKUPS || 50);
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => ({ file, fullPath: path.join(BACKUP_DIR, file), time: fs.statSync(path.join(BACKUP_DIR, file)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  backups.slice(maxBackups).forEach(item => {
    try { fs.unlinkSync(item.fullPath); } catch (error) { console.warn('Altes Backup konnte nicht gelöscht werden:', error.message); }
  });
}

function createBackup(reason = 'manual') {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const current = fs.readFileSync(DATA_FILE, 'utf8');
    if (!current || current.trim() === '[]') return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = String(reason).replace(/[^a-z0-9-_]/gi, '').slice(0, 40) || 'backup';
    const backupFile = path.join(BACKUP_DIR, `anfragen-${timestamp}-${safeReason}.json`);
    fs.writeFileSync(backupFile, current, 'utf8');
    pruneBackups();
  } catch (error) {
    console.warn('Backup konnte nicht erstellt werden:', error.message);
  }
}

function createCsrfToken(req) {
  const token = crypto.randomBytes(32).toString('hex');
  req.session.csrfToken = token;
  return token;
}

function verifyCsrf(req, res, next) {
  const tokenFromForm = req.body?._csrf;
  const tokenFromSession = req.session?.csrfToken;

  if (!tokenFromForm || !tokenFromSession || tokenFromForm !== tokenFromSession) {
    addActivity(req, 'csrf_blocked', { path: req.path });
    return res.status(403).send('Sicherheitsprüfung fehlgeschlagen. Bitte lade das Dashboard neu und versuche es erneut.');
  }

  next();
}

function cleanText(value, maxLength = 500) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function cleanMultiline(value, maxLength = 3000) {
  return String(value || '').trim().replace(/\r\n/g, '\n').slice(0, maxLength);
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 120;
}

function isValidPhone(value) {
  return /^[0-9+()\-\s/]{5,35}$/.test(value || '');
}

function normalizeBudget(value) {
  const raw = String(value || '').trim().replace('€', '').trim();
  if (!raw) return '';
  const normalized = raw.replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(normalized)) return null;
  return raw.replace('.', ',');
}

function validateRequestForm(body) {
  const data = {
    name: cleanText(body.name, 80),
    email: cleanText(body.email, 120),
    telefon: cleanText(body.telefon, 35),
    adresse: cleanText(body.adresse, 160),
    leistung: cleanText(body.leistung, 60),
    auftragsart: cleanText(body.auftragsart, 80),
    groesse: cleanText(body.groesse, 80),
    zeitraum: cleanText(body.zeitraum, 80),
    details: cleanMultiline(body.details, 3000),
    budget: normalizeBudget(body.budget),
    besichtigung: cleanText(body.besichtigung, 80),
    erreichbarkeit: cleanText(body.erreichbarkeit, 80),
    kontaktart: cleanText(body.kontaktart, 80),
    datenschutz: body.datenschutz
  };

  const errors = [];
  if (!data.name) errors.push('Name fehlt.');
  if (!data.telefon) errors.push('Telefon fehlt.');
  if (data.telefon && !isValidPhone(data.telefon)) errors.push('Telefonnummer ist ungültig.');
  if (data.email && !isValidEmail(data.email)) errors.push('E-Mail-Adresse ist ungültig.');
  if (!data.leistung || data.leistung === 'Gewünschte Leistung *') errors.push('Gewünschte Leistung fehlt.');
  if (!data.details) errors.push('Details zum Auftrag fehlen.');
  if (data.budget === null) errors.push('Budget muss eine Zahl sein, zum Beispiel 500 oder 1200,50.');
  if (!data.datenschutz) errors.push('Datenschutz-Bestätigung fehlt.');

  return { data, errors };
}


function normalizeForDuplicate(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function createRequestFingerprint(data) {
  const parts = [
    data.name,
    data.email,
    data.telefon,
    data.adresse,
    data.leistung,
    data.auftragsart,
    data.groesse,
    data.zeitraum,
    data.details,
    data.budget,
    data.besichtigung,
    data.erreichbarkeit,
    data.kontaktart
  ].map(normalizeForDuplicate);

  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}


function mailIsEnabled() {
  return String(process.env.MAIL_ENABLED || '').toLowerCase() === 'true';
}

function getTransporter() {
  if (!mailIsEnabled()) return null;

  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.warn(`E-Mail Versand ist aktiviert, aber diese Variablen fehlen: ${missing.join(', ')}`);
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendMail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter || !to) return;

  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      text,
      html
    });
    console.log(`E-Mail gesendet an ${to}: ${subject}`);
  } catch (error) {
    console.error('E-Mail konnte nicht gesendet werden:', error.message);
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusText(status) {
  if (status === 'Neu') return 'Deine Anfrage ist bei uns eingegangen und wurde als neu erfasst.';
  if (status === 'In Bearbeitung') return 'Wir bearbeiten deine Anfrage jetzt und melden uns zeitnah bei dir.';
  if (status === 'Erledigt') return 'Deine Anfrage wurde bei uns als erledigt markiert. Vielen Dank für dein Vertrauen.';
  return `Der Status deiner Anfrage wurde auf "${status}" geändert.`;
}

async function sendCustomerConfirmation(anfrage) {
  if (!anfrage.email) return;

  const subject = 'Bestätigung deiner Anfrage bei GrünWerk Gartenbau';
  const text = `Hallo ${anfrage.name},\n\n` +
    `vielen Dank für deine Anfrage bei GrünWerk Gartenbau. Wir haben deine Anfrage erhalten und melden uns schnellstmöglich bei dir.\n\n` +
    `Leistung: ${anfrage.kategorie || '-'}\n` +
    `Telefon: ${anfrage.telefon || '-'}\n` +
    `Adresse / Ort: ${anfrage.adresse || '-'}\n` +
    `Budget: ${anfrage.budget || '-'}\n\n` +
    `Deine Nachricht:\n${anfrage.details || '-'}\n\n` +
    `Viele Grüße\nGrünWerk Gartenbau`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#193222">
      <h2>Danke für deine Anfrage, ${escapeHtml(anfrage.name)}!</h2>
      <p>Wir haben deine Anfrage erhalten und melden uns schnellstmöglich bei dir.</p>
      <div style="background:#f6f3eb;border-radius:14px;padding:16px;margin:18px 0">
        <p><strong>Leistung:</strong> ${escapeHtml(anfrage.kategorie || '-')}</p>
        <p><strong>Telefon:</strong> ${escapeHtml(anfrage.telefon || '-')}</p>
        <p><strong>Adresse / Ort:</strong> ${escapeHtml(anfrage.adresse || '-')}</p>
        <p><strong>Budget:</strong> ${escapeHtml(anfrage.budget || '-')}</p>
      </div>
      <p><strong>Deine Nachricht:</strong></p>
      <p>${escapeHtml(anfrage.details || '-').replaceAll('\n', '<br>')}</p>
      <p>Viele Grüße<br><strong>GrünWerk Gartenbau</strong></p>
    </div>
  `;

  await sendMail({ to: anfrage.email, subject, text, html });
}

async function sendAdminNotification(anfrage) {
  if (!process.env.ADMIN_EMAIL) return;

  const subject = `Neue Anfrage von ${anfrage.name}`;
  const text = `Neue Anfrage eingegangen:\n\n` +
    `Name: ${anfrage.name}\n` +
    `E-Mail: ${anfrage.email || '-'}\n` +
    `Telefon: ${anfrage.telefon || '-'}\n` +
    `Leistung: ${anfrage.kategorie || '-'}\n` +
    `Adresse / Ort: ${anfrage.adresse || '-'}\n` +
    `Budget: ${anfrage.budget || '-'}\n\n` +
    `Details:\n${anfrage.details || '-'}\n`;

  await sendMail({ to: process.env.ADMIN_EMAIL, subject, text });
}

async function sendStatusEmail(anfrage, oldStatus, newStatus) {
  if (!anfrage.email || oldStatus === newStatus) return;

  const subject = `Update zu deiner Anfrage: ${newStatus}`;
  const text = `Hallo ${anfrage.name},\n\n` +
    `der Status deiner Anfrage bei GrünWerk Gartenbau wurde geändert.\n\n` +
    `Alter Status: ${oldStatus}\n` +
    `Neuer Status: ${newStatus}\n\n` +
    `${statusText(newStatus)}\n\n` +
    `Viele Grüße\nGrünWerk Gartenbau`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#193222">
      <h2>Status-Update zu deiner Anfrage</h2>
      <p>Hallo ${escapeHtml(anfrage.name)},</p>
      <p>der Status deiner Anfrage wurde geändert.</p>
      <div style="background:#f6f3eb;border-radius:14px;padding:16px;margin:18px 0">
        <p><strong>Alter Status:</strong> ${escapeHtml(oldStatus)}</p>
        <p><strong>Neuer Status:</strong> ${escapeHtml(newStatus)}</p>
      </div>
      <p>${escapeHtml(statusText(newStatus))}</p>
      <p>Viele Grüße<br><strong>GrünWerk Gartenbau</strong></p>
    </div>
  `;

  await sendMail({ to: anfrage.email, subject, text, html });
}

function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect('/login');
}

function splitAdminPair(pair) {
  const index = pair.indexOf(':');
  if (index === -1) return null;
  return {
    username: pair.slice(0, index),
    passwordOrHash: pair.slice(index + 1)
  };
}

async function passwordMatches(password, passwordOrHash) {
  if (!passwordOrHash) return false;

  const looksHashed = passwordOrHash.startsWith('$2a$') || passwordOrHash.startsWith('$2b$') || passwordOrHash.startsWith('$2y$');
  if (looksHashed) return bcrypt.compare(password, passwordOrHash);

  // Fallback für ältere Konfigurationen. Besser: ADMIN_PASSWORD_HASH oder ADMINS_HASHED benutzen.
  return password === passwordOrHash;
}

async function isAdminLoginCorrect(username, password) {
  const adminsHashedText = process.env.ADMINS_HASHED || '';
  if (adminsHashedText.trim()) {
    for (const pair of adminsHashedText.split(',')) {
      const admin = splitAdminPair(pair.trim());
      if (admin && admin.username === username && await passwordMatches(password, admin.passwordOrHash)) return true;
    }
  }

  if (process.env.ADMIN_USERNAME === username && process.env.ADMIN_PASSWORD_HASH) {
    return passwordMatches(password, process.env.ADMIN_PASSWORD_HASH);
  }

  const adminsText = process.env.ADMINS || '';
  if (adminsText.trim()) {
    for (const pair of adminsText.split(',')) {
      const admin = splitAdminPair(pair.trim());
      if (admin && admin.username === username && await passwordMatches(password, admin.passwordOrHash)) return true;
    }
  }

  return username === process.env.ADMIN_USERNAME && await passwordMatches(password, process.env.ADMIN_PASSWORD);
}



function maintenancePage() {
  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Website in Wartung | GrünWerk Gartenbau</title>
      <style>
        * { box-sizing: border-box; }
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          font-family: Arial, sans-serif;
          background:
            radial-gradient(circle at top left, rgba(194, 232, 190, 0.65), transparent 38%),
            radial-gradient(circle at bottom right, rgba(220, 245, 160, 0.55), transparent 40%),
            #f6f3eb;
          color: #193222;
          padding: 24px;
        }
        .box {
          width: min(720px, 100%);
          padding: 52px;
          border-radius: 36px;
          background: rgba(255,255,255,0.88);
          box-shadow: 0 34px 90px rgba(25, 50, 34, 0.16);
          text-align: center;
          border: 1px solid rgba(36,77,52,0.10);
        }
        .logo {
          width: 66px;
          height: 66px;
          margin: 0 auto 24px;
          display: grid;
          place-items: center;
          border-radius: 22px;
          background: #244d34;
          color: white;
          font-size: 30px;
          box-shadow: 0 18px 38px rgba(25, 50, 34, 0.22);
        }
        h1 {
          margin: 0;
          font-size: clamp(36px, 7vw, 64px);
          line-height: 0.95;
          letter-spacing: -0.06em;
          color: #193222;
        }
        p {
          margin: 22px auto 0;
          max-width: 540px;
          font-size: 18px;
          line-height: 1.7;
          color: #667466;
        }
        .note {
          margin-top: 30px;
          display: inline-flex;
          border-radius: 999px;
          background: #e1eadb;
          color: #244d34;
          padding: 12px 18px;
          font-weight: 700;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <main class="box">
        <div class="logo">☘</div>
        <h1>Website in Wartung</h1>
        <p>Wir überarbeiten gerade unsere Website. Bitte versuche es später erneut. Vielen Dank für dein Verständnis.</p>
        <div class="note">GrünWerk Gartenbau</div>
      </main>
    </body>
    </html>
  `;
}


app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      fontSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginResourcePolicy: false
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)');
  next();
});

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  const maintenanceMode = String(process.env.MAINTENANCE_MODE || '').toLowerCase() === 'true';

  const allowedPrefixes = [
    '/admin',
    '/login',
    '/logout',
    '/style.css',
    '/favicon.ico'
  ];

  const isAllowedPath = allowedPrefixes.some(prefix => req.path.startsWith(prefix));

  if (maintenanceMode && !isAllowedPath) {
    return res.status(503).send(maintenancePage());
  }

  next();
});
app.use(session({
  secret: process.env.SESSION_SECRET || 'bitte-aendern',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.get('/', (req, res) => {
  res.render('kontakt', { success: req.query.success === '1' });
});

app.post('/anfrage', formLimiter, async (req, res) => {
  const { data, errors } = validateRequestForm(req.body);

  if (errors.length > 0) {
    return res.status(400).send(`Bitte korrigiere deine Eingaben:<br><br>${errors.map(escapeHtml).join('<br>')}`);
  }

  const {
    name,
    email,
    telefon,
    adresse,
    leistung,
    auftragsart,
    groesse,
    zeitraum,
    details,
    budget,
    besichtigung,
    erreichbarkeit,
    kontaktart
  } = data;

  const requestFingerprint = createRequestFingerprint({
    name,
    email,
    telefon,
    adresse,
    leistung,
    auftragsart,
    groesse,
    zeitraum,
    details,
    budget,
    besichtigung,
    erreichbarkeit,
    kontaktart
  });

  const anfragen = readAnfragen();
  const alreadyExists = anfragen.some(a => a.requestFingerprint === requestFingerprint);
  if (alreadyExists) {
    console.log('Doppelte Formular-Anfrage erkannt. Speichern und E-Mail-Versand übersprungen.');
    return res.redirect('/?success=1');
  }

  const budgetText = budget ? `${budget} €` : '-';

  const nachricht = [
    `Adresse / Ort: ${adresse || '-'}`,
    `Leistung: ${leistung || '-'}`,
    `Auftragsart: ${auftragsart || '-'}`,
    `Grundstücksgröße: ${groesse || '-'}`,
    `Zeitraum: ${zeitraum || '-'}`,
    `Budget: ${budgetText}`,
    `Besichtigung: ${besichtigung || '-'}`,
    `Erreichbarkeit: ${erreichbarkeit || '-'}`,
    `Bevorzugte Kontaktart: ${kontaktart || '-'}`,
    '',
    'Details:',
    details || '-'
  ].join('\n');

  const neueAnfrage = {
    id: Date.now().toString(),
    requestFingerprint,
    createdAt: new Date().toISOString(),
    name,
    email: email || '',
    telefon,
    kategorie: leistung || 'Sonstiges',
    nachricht,
    adresse: adresse || '',
    leistung: leistung || '',
    auftragsart: auftragsart || '',
    groesse: groesse || '',
    zeitraum: zeitraum || '',
    budget: budgetText,
    besichtigung: besichtigung || '',
    erreichbarkeit: erreichbarkeit || '',
    kontaktart: kontaktart || '',
    details: details || '',
    status: 'Neu',
    datum: new Date().toLocaleString('de-DE')
  };

  createBackup('before-create');
  anfragen.unshift(neueAnfrage);
  writeAnfragen(anfragen);
  addActivity(req, 'request_created', { requestId: neueAnfrage.id, name: neueAnfrage.name, leistung: neueAnfrage.kategorie });

  await sendCustomerConfirmation(neueAnfrage);
  await sendAdminNotification(neueAnfrage);

  res.redirect('/?success=1');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', loginLimiter, async (req, res) => {
  const username = cleanText(req.body.username, 80);
  const password = String(req.body.password || '');

  if (await isAdminLoginCorrect(username, password)) {
    req.session.loggedIn = true;
    req.session.username = username;
    addActivity(req, 'login_success', { username });
    return res.redirect('/admin');
  }

  addActivity(req, 'login_failed', { username });
  res.render('login', { error: 'Benutzername oder Passwort ist falsch.' });
});

app.post('/logout', requireLogin, verifyCsrf, (req, res) => {
  addActivity(req, 'logout', { username: req.session.username });
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/admin', requireLogin, (req, res) => {
  const anfragen = readAnfragen();
  const suche = (req.query.suche || '').toLowerCase();
  const gefiltert = suche
    ? anfragen.filter(a =>
        a.name.toLowerCase().includes(suche) ||
        a.email.toLowerCase().includes(suche) ||
        a.telefon.toLowerCase().includes(suche) ||
        a.kategorie.toLowerCase().includes(suche) ||
        a.nachricht.toLowerCase().includes(suche) ||
        a.status.toLowerCase().includes(suche)
      )
    : anfragen;

  res.render('admin', {
    anfragen: gefiltert,
    suche: req.query.suche || '',
    username: req.session.username || 'Admin',
    csrfToken: createCsrfToken(req),
    activityLog: readActivityLog(10)
  });
});

app.post('/admin/status/:id', requireLogin, verifyCsrf, async (req, res) => {
  const anfragen = readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);
  if (anfrage) {
    const oldStatus = anfrage.status || 'Neu';
    const allowedStatuses = ['Neu', 'In Bearbeitung', 'Erledigt'];
    const newStatus = allowedStatuses.includes(req.body.status) ? req.body.status : oldStatus;
    anfrage.status = newStatus;
    createBackup('before-status');
    writeAnfragen(anfragen);
    addActivity(req, 'status_changed', { requestId: anfrage.id, name: anfrage.name, oldStatus, newStatus });
    await sendStatusEmail(anfrage, oldStatus, newStatus);
  }
  res.redirect('/admin');
});

app.post('/admin/delete/:id', requireLogin, verifyCsrf, (req, res) => {
  const before = readAnfragen();
  const deleted = before.find(a => a.id === req.params.id);
  const anfragen = before.filter(a => a.id !== req.params.id);
  createBackup('before-delete');
  writeAnfragen(anfragen);
  if (deleted) addActivity(req, 'request_deleted', { requestId: deleted.id, name: deleted.name, leistung: deleted.kategorie });
  res.redirect('/admin');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Admin-Dashboard: /admin`);
});
