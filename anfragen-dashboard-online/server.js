require('dotenv').config();

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const { Resend } = require('resend');
const { Pool } = require('pg');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const tls = require('tls');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'anfragen.json');
const ACTIVITY_LOG_FILE = path.join(DATA_DIR, 'activity-log.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const MAX_PHOTO_SIZE_MB = Number(process.env.MAX_PHOTO_SIZE_MB || 10);
const MAX_PHOTO_SIZE_BYTES = MAX_PHOTO_SIZE_MB * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PHOTO_SIZE_BYTES,
    files: 12
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Nur Bilddateien im Format JPG, PNG oder WEBP sind erlaubt.'));
  }
});

function handleUpload(middleware) {
  return (req, res, next) => {
    middleware(req, res, error => {
      if (!error) return next();
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? `Ein Bild ist zu groß. Maximal erlaubt sind ${MAX_PHOTO_SIZE_MB} MB pro Bild.`
        : error.message || 'Upload fehlgeschlagen.';
      return res.status(400).send(`Upload-Fehler: ${escapeHtml(message)}`);
    });
  };
}

function sanitizeFileName(name) {
  return cleanText(name, 120).replace(/[^a-zA-Z0-9._ -äöüÄÖÜß]/g, '').trim() || 'foto';
}

function filesToPhotoObjects(files = [], uploadedBy = 'System', type = 'photo') {
  return files.map(file => ({
    id: crypto.randomUUID(),
    type,
    originalName: sanitizeFileName(file.originalname),
    mimeType: file.mimetype,
    size: file.size,
    sizeKb: Math.max(1, Math.round(file.size / 1024)),
    uploadedBy: cleanText(uploadedBy, 80) || 'System',
    uploadedAt: new Date().toISOString(),
    uploadedAtLabel: formatBerlinDateTime(),
    dataUrl: `data:${file.mimetype};base64,${file.buffer.toString('base64')}`
  }));
}


function photoToBuffer(photo) {
  if (!photo || !photo.dataUrl) return null;
  const match = String(photo.dataUrl).match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;

  const mimeType = photo.mimeType || match[1] || 'application/octet-stream';
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) return null;

  return {
    mimeType,
    buffer: Buffer.from(match[2], 'base64'),
    fileName: sanitizeFileName(photo.originalName || `foto-${photo.id || Date.now()}`)
  };
}

function findPhotoInAnfrage(anfrage, photoId) {
  if (!anfrage || !photoId) return null;
  const collections = [
    { key: 'customerPhotos', label: 'Kundenfoto' },
    { key: 'beforePhotos', label: 'Vorher-Foto' },
    { key: 'afterPhotos', label: 'Nachher-Foto' }
  ];

  for (const collection of collections) {
    const photos = Array.isArray(anfrage[collection.key]) ? anfrage[collection.key] : [];
    const photo = photos.find(item => item.id === photoId);
    if (photo) return { photo, collection: collection.key, label: collection.label };
  }

  return null;
}

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

const usePostgres = Boolean(process.env.DATABASE_URL);
const pool = usePostgres ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
}) : null;

let dbReadyPromise = null;

function readAnfragenFromFile() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (error) {
    return [];
  }
}

function writeAnfragenToFile(anfragen) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(anfragen, null, 2), 'utf8');
}

async function initDatabase() {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS anfragen (
      id TEXT PRIMARY KEY,
      request_fingerprint TEXT UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL
    )
  `);

  await pool.query('CREATE INDEX IF NOT EXISTS idx_anfragen_created_at ON anfragen (created_at DESC)');
  await pool.query("CREATE INDEX IF NOT EXISTS idx_anfragen_status ON anfragen ((data->>'status'))");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users (username)');
  await bootstrapAdminUsers();

  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM anfragen');
  const tableIsEmpty = Number(countResult.rows[0]?.count || 0) === 0;
  const localAnfragen = readAnfragenFromFile();

  if (tableIsEmpty && localAnfragen.length > 0) {
    console.log(`[DB] Migriere ${localAnfragen.length} lokale Anfrage(n) aus data/anfragen.json nach PostgreSQL.`);
    await writeAnfragen(localAnfragen);
  }
}

async function ensureDatabase() {
  if (!pool) return;
  if (!dbReadyPromise) dbReadyPromise = initDatabase();
  return dbReadyPromise;
}

const ADMIN_ROLES = ['owner', 'admin', 'mitarbeiter'];

function normalizeRole(role) {
  const normalized = String(role || 'admin').toLowerCase().trim();
  return ADMIN_ROLES.includes(normalized) ? normalized : 'admin';
}

function roleLabel(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'mitarbeiter') return 'Mitarbeiter';
  return 'Admin';
}

function parseAdminPairsFromEnv() {
  const items = [];
  const add = (username, passwordOrHash, role = 'admin') => {
    const cleanUsername = cleanText(username, 80);
    if (!cleanUsername || !passwordOrHash) return;
    if (items.some(item => item.username === cleanUsername)) return;
    items.push({ username: cleanUsername, passwordOrHash, role: normalizeRole(role) });
  };

  const parsePairs = (text, defaultRole) => {
    String(text || '').split(',').forEach(pair => {
      const admin = splitAdminPair(pair.trim());
      if (admin) add(admin.username, admin.passwordOrHash, defaultRole);
    });
  };

  parsePairs(process.env.ADMINS_HASHED, 'admin');
  parsePairs(process.env.ADMINS, 'admin');

  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH) add(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD_HASH, 'owner');
  if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) add(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD, 'owner');

  if (items.length > 0 && !items.some(item => item.role === 'owner')) items[0].role = 'owner';
  return items;
}

async function hashPasswordIfNeeded(passwordOrHash) {
  const value = String(passwordOrHash || '');
  const looksHashed = value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$');
  if (looksHashed) return value;
  return bcrypt.hash(value, 12);
}

async function bootstrapAdminUsers() {
  if (!pool) return;
  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM admin_users');
  if (Number(countResult.rows[0]?.count || 0) > 0) return;

  const admins = parseAdminPairsFromEnv();
  if (admins.length === 0) {
    console.warn('[ADMIN] Keine Admins in Environment gefunden. Lege mindestens ADMIN_USERNAME/ADMIN_PASSWORD oder ADMINS an.');
    return;
  }

  for (const admin of admins) {
    const id = crypto.randomUUID();
    const passwordHash = await hashPasswordIfNeeded(admin.passwordOrHash);
    await pool.query(
      `INSERT INTO admin_users (id, username, password_hash, role, active, created_by)
       VALUES ($1, $2, $3, $4, true, 'environment-bootstrap')
       ON CONFLICT (username) DO NOTHING`,
      [id, admin.username, passwordHash, normalizeRole(admin.role)]
    );
  }

  console.log(`[ADMIN] ${admins.length} Admin-Benutzer aus Environment in PostgreSQL übernommen.`);
}

async function getDbAdminByUsername(username) {
  if (!pool) return null;
  await ensureDatabase();
  const result = await pool.query(
    'SELECT id, username, password_hash, role, active, created_at FROM admin_users WHERE username = $1 LIMIT 1',
    [username]
  );
  return result.rows[0] || null;
}

async function authenticateAdmin(username, password) {
  if (pool) {
    const admin = await getDbAdminByUsername(username);
    if (!admin || !admin.active) return null;
    const ok = await passwordMatches(password, admin.password_hash);
    if (!ok) return null;
    return { id: admin.id, username: admin.username, role: normalizeRole(admin.role) };
  }

  if (await isAdminLoginCorrect(username, password)) {
    return { id: username, username, role: 'owner' };
  }

  return null;
}

async function listAdminUsers() {
  if (!pool) return [];
  await ensureDatabase();
  const result = await pool.query(
    `SELECT id, username, role, active, created_at, created_by
     FROM admin_users
     ORDER BY created_at ASC, username ASC`
  );

  return result.rows.map(row => ({
    ...row,
    role: normalizeRole(row.role),
    roleLabel: roleLabel(normalizeRole(row.role)),
    createdLabel: row.created_at ? formatBerlinDateTime(row.created_at) : '-'
  }));
}

async function countActiveOwners(excludeId = null) {
  if (!pool) return 0;
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM admin_users
     WHERE role = 'owner' AND active = true AND ($1::text IS NULL OR id <> $1)`,
    [excludeId]
  );
  return Number(result.rows[0]?.count || 0);
}

async function createAdminUser({ username, password, role, createdBy }) {
  if (!pool) throw new Error('User-Verwaltung braucht PostgreSQL.');
  const cleanUsername = cleanText(username, 80);
  if (!/^[a-zA-Z0-9_.-]{2,40}$/.test(cleanUsername)) throw new Error('Benutzername darf nur Buchstaben, Zahlen, Punkt, Unterstrich und Bindestrich enthalten.');
  if (String(password || '').length < 8) throw new Error('Passwort muss mindestens 8 Zeichen lang sein.');

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(String(password), 12);
  await pool.query(
    `INSERT INTO admin_users (id, username, password_hash, role, active, created_by)
     VALUES ($1, $2, $3, $4, true, $5)`,
    [id, cleanUsername, passwordHash, normalizeRole(role), createdBy || null]
  );
}

function getPermissions(role) {
  const cleanRole = normalizeRole(role);
  return {
    role: cleanRole,
    roleLabel: roleLabel(cleanRole),
    canManageUsers: cleanRole === 'owner',
    canDeleteRequests: cleanRole === 'owner' || cleanRole === 'admin',
    canDownloadBackups: cleanRole === 'owner' || cleanRole === 'admin',
    canViewActivity: cleanRole === 'owner',
    canChangeStatus: ['owner', 'admin', 'mitarbeiter'].includes(cleanRole),
    canWriteNotes: ['owner', 'admin', 'mitarbeiter'].includes(cleanRole),
    canUploadPhotos: ['owner', 'admin', 'mitarbeiter'].includes(cleanRole)
  };
}

function requireRole(...roles) {
  return (req, res, next) => {
    const role = normalizeRole(req.session?.role);
    if (roles.includes(role)) return next();
    addActivity(req, 'permission_denied', { path: req.path, required: roles.join(','), role });
    return res.status(403).send('Du hast für diese Aktion keine Berechtigung.');
  };
}

function normalizeDbAnfrage(row) {
  const data = row.data || {};
  return {
    ...data,
    id: data.id || row.id,
    requestFingerprint: data.requestFingerprint || row.request_fingerprint || '',
    createdAt: data.createdAt || (row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString())
  };
}

async function readAnfragen() {
  if (!pool) return readAnfragenFromFile();

  await ensureDatabase();
  const result = await pool.query('SELECT id, request_fingerprint, created_at, data FROM anfragen ORDER BY created_at DESC');
  return result.rows.map(normalizeDbAnfrage);
}

async function writeAnfragen(anfragen) {
  if (!pool) {
    writeAnfragenToFile(anfragen);
    return;
  }

  await ensureDatabase();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE anfragen');

    for (const anfrage of anfragen) {
      const id = String(anfrage.id || crypto.randomUUID());
      const requestFingerprint = anfrage.requestFingerprint || null;
      const createdAt = anfrage.createdAt || new Date().toISOString();
      const data = { ...anfrage, id, requestFingerprint, createdAt };

      await client.query(
        `INSERT INTO anfragen (id, request_fingerprint, created_at, data)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [id, requestFingerprint, createdAt, JSON.stringify(data)]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function formatBerlinDateTime(date = new Date()) {
  return date.toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
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
    datum: formatBerlinDateTime(),
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

async function createBackup(reason = 'manual') {
  try {
    const anfragen = await readAnfragen();
    if (!anfragen || anfragen.length === 0) return;

    const current = JSON.stringify(anfragen, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = String(reason).replace(/[^a-z0-9-_]/gi, '').slice(0, 40) || 'backup';
    const backupFile = path.join(BACKUP_DIR, `anfragen-${timestamp}-${safeReason}.json`);
    fs.writeFileSync(backupFile, current, 'utf8');
    pruneBackups();
  } catch (error) {
    console.warn('Backup konnte nicht erstellt werden:', error.message);
  }
}

function listBackups(limit = 20) {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const fullPath = path.join(BACKUP_DIR, file);
        const stat = fs.statSync(fullPath);
        return {
          file,
          size: stat.size,
          sizeKb: Math.max(1, Math.round(stat.size / 1024)),
          modified: stat.mtime,
          modifiedLabel: formatBerlinDateTime(stat.mtime)
        };
      })
      .sort((a, b) => b.modified - a.modified)
      .slice(0, limit);
  } catch (error) {
    console.warn('Backups konnten nicht gelesen werden:', error.message);
    return [];
  }
}

function getSafeBackupPath(filename) {
  const safeName = path.basename(String(filename || ''));
  if (!safeName.endsWith('.json')) return null;
  if (!safeName.startsWith('anfragen-')) return null;

  const fullPath = path.join(BACKUP_DIR, safeName);
  if (!fullPath.startsWith(BACKUP_DIR)) return null;
  if (!fs.existsSync(fullPath)) return null;

  return { safeName, fullPath };
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
    email: normalizeEmailAddress(body.email),
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
  if (!data.email) errors.push('E-Mail-Adresse fehlt.');
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
    data.kontaktart,
    data.photoSignature
  ].map(normalizeForDuplicate);

  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}


function mailIsEnabled() {
  return String(process.env.MAIL_ENABLED || '').toLowerCase() === 'true';
}

function mailDebugEnabled() {
  return String(process.env.MAIL_DEBUG || 'true').toLowerCase() === 'true';
}

function logMail(message, details = {}) {
  if (!mailDebugEnabled()) return;
  const safeDetails = { ...details };
  if (safeDetails.apiKey) safeDetails.apiKey = '[hidden]';
  if (safeDetails.smtpPass) safeDetails.smtpPass = '[hidden]';
  console.log(`[MAIL] ${message}`, Object.keys(safeDetails).length ? safeDetails : '');
}

function normalizeEmailAddress(value) {
  return String(value || '').trim().toLowerCase();
}

function getMailFrom() {
  return process.env.RESEND_FROM || process.env.MAIL_FROM;
}

function getResendClient() {
  if (!mailIsEnabled()) {
    logMail('Versand deaktiviert. MAIL_ENABLED ist nicht true.');
    return null;
  }

  if (!process.env.RESEND_API_KEY) {
    console.warn('[MAIL] RESEND_API_KEY fehlt. Resend-Mailversand ist nicht verfügbar.');
    return null;
  }

  if (!getMailFrom()) {
    console.warn('[MAIL] RESEND_FROM oder MAIL_FROM fehlt. Absender ist nicht gesetzt.');
    return null;
  }

  return new Resend(process.env.RESEND_API_KEY);
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout nach ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function sendMail({ to, subject, text, html, replyTo, type = 'mail' }) {
  const recipient = normalizeEmailAddress(to);

  if (!recipient) {
    logMail(`${type}: übersprungen, weil kein Empfänger vorhanden ist.`, { subject });
    return false;
  }

  if (!isValidEmail(recipient)) {
    console.warn(`[MAIL] ${type}: ungültige Empfängeradresse: ${recipient}`);
    return false;
  }

  const resend = getResendClient();
  if (!resend) {
    console.warn(`[MAIL] ${type}: Resend nicht verfügbar. Mail an ${recipient} wurde nicht gesendet.`);
    return false;
  }

  const maxAttempts = Number(process.env.MAIL_RETRY_ATTEMPTS || 3);
  const timeoutMs = Number(process.env.MAIL_TIMEOUT_MS || 30000);
  const from = getMailFrom();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await withTimeout(
        resend.emails.send({
          from,
          to: [recipient],
          subject,
          text,
          html,
          reply_to: replyTo || undefined,
          headers: {
            'X-Entity-Ref-ID': crypto.randomUUID()
          }
        }),
        timeoutMs,
        `${type} an ${recipient}`
      );

      if (result.error) {
        throw new Error(result.error.message || JSON.stringify(result.error));
      }

      console.log(`[MAIL] ${type}: gesendet via Resend`, {
        to: recipient,
        subject,
        attempt,
        id: result.data?.id || null
      });

      return true;
    } catch (error) {
      const isLastAttempt = attempt >= maxAttempts;
      console.error(`[MAIL] ${type}: Versuch ${attempt}/${maxAttempts} fehlgeschlagen an ${recipient}:`, error.message);

      if (isLastAttempt) {
        console.error(`[MAIL] ${type}: endgültig nicht gesendet an ${recipient}.`);
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  return false;
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


function getRequestCode(anfrage) {
  return String(anfrage?.ticketCode || anfrage?.id || '').slice(-6) || '000000';
}

function getReplyToForRequest(anfrage) {
  return process.env.REPLY_TO_EMAIL || getMailFrom() || undefined;
}

function subjectWithRequestCode(base, anfrage) {
  return `${base} #${getRequestCode(anfrage)}`;
}

async function sendCustomerConfirmation(anfrage) {
  if (!anfrage.email) {
    logMail('Kunden-Bestätigung übersprungen: Anfrage hat keine E-Mail-Adresse.', { requestId: anfrage.id, name: anfrage.name });
    return false;
  }

  const subject = subjectWithRequestCode('Bestätigung deiner Anfrage bei GrünWerk Gartenbau', anfrage);
  const text = `Hallo ${anfrage.name},\n\n` +
    `vielen Dank für deine Anfrage bei GrünWerk Gartenbau. Wir haben deine Anfrage erhalten und melden uns schnellstmöglich bei dir.\n\n` +
    `Anfragenummer: #${getRequestCode(anfrage)}\n` +
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
      <p><strong>Anfragenummer:</strong> #${escapeHtml(getRequestCode(anfrage))}</p>
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

  await sendMail({ to: anfrage.email, subject, text, html, replyTo: getReplyToForRequest(anfrage), type: 'Kunden-Bestätigung' });
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

  await sendMail({ to: process.env.ADMIN_EMAIL, subject, text, replyTo: anfrage.email || undefined, type: 'Admin-Benachrichtigung' });
}

async function sendStatusEmail(anfrage, oldStatus, newStatus) {
  if (!anfrage.email) {
    logMail('Status-Mail übersprungen: Anfrage hat keine E-Mail-Adresse.', { requestId: anfrage.id, name: anfrage.name });
    return false;
  }
  if (oldStatus === newStatus) {
    logMail('Status-Mail übersprungen: Status wurde nicht geändert.', { requestId: anfrage.id, status: newStatus });
    return false;
  }

  const subject = subjectWithRequestCode(`Update zu deiner Anfrage: ${newStatus}`, anfrage);
  const text = `Hallo ${anfrage.name},\n\n` +
    `der Status deiner Anfrage bei GrünWerk Gartenbau wurde geändert.\n\n` +
    `Anfragenummer: #${getRequestCode(anfrage)}\n` +
    `Alter Status: ${oldStatus}\n` +
    `Neuer Status: ${newStatus}\n\n` +
    `${statusText(newStatus)}\n\n` +
    `Viele Grüße\nGrünWerk Gartenbau`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#193222">
      <h2>Status-Update zu deiner Anfrage</h2>
      <p>Hallo ${escapeHtml(anfrage.name)},</p>
      <p>der Status deiner Anfrage wurde geändert.</p>
      <p><strong>Anfragenummer:</strong> #${escapeHtml(getRequestCode(anfrage))}</p>
      <div style="background:#f6f3eb;border-radius:14px;padding:16px;margin:18px 0">
        <p><strong>Alter Status:</strong> ${escapeHtml(oldStatus)}</p>
        <p><strong>Neuer Status:</strong> ${escapeHtml(newStatus)}</p>
      </div>
      <p>${escapeHtml(statusText(newStatus))}</p>
      <p>Viele Grüße<br><strong>GrünWerk Gartenbau</strong></p>
    </div>
  `;

  await sendMail({ to: anfrage.email, subject, text, html, replyTo: getReplyToForRequest(anfrage), type: 'Status-Mail' });
}


function getHeaderValue(req, name) {
  const value = req.headers[String(name).toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function verifyInboundWebhookToken(req) {
  const expected = process.env.INBOUND_WEBHOOK_TOKEN;
  if (!expected) return true;
  const received = req.query.token || getHeaderValue(req, 'x-webhook-token') || getHeaderValue(req, 'x-inbound-token');
  return String(received || '') === String(expected);
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value) && value.length) {
      const nested = firstString(...value);
      if (nested) return nested;
    }
    if (value && typeof value === 'object') {
      const nested = firstString(value.email, value.address, value.text, value.name);
      if (nested) return nested;
    }
  }
  return '';
}

function extractInboundPayload(body = {}) {
  const data = body.data || body.email || body;
  const from = firstString(data.from, data.sender, data.from_email, data.fromEmail);
  const to = firstString(data.to, data.recipients, data.recipient, data.to_email, data.toEmail);
  const subject = firstString(data.subject, body.subject);
  const text = firstString(data.text, data.text_body, data.textBody, data.plain, data.plainText, data.body?.text, data.body);
  const html = firstString(data.html, data.html_body, data.htmlBody, data.body?.html);
  const attachments = data.attachments || data.files || body.attachments || [];
  return { from, to, subject, text, html, attachments: Array.isArray(attachments) ? attachments : [] };
}

function stripHtmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

function extractRequestCodes(...texts) {
  const combined = texts.filter(Boolean).map(String).join('\n');
  const codes = [];
  const patterns = [/#\s*([0-9]{4,})/g, /(?:Anfrage|Anfragenummer|Ticket|Auftrag)\s*[:#-]?\s*([0-9]{4,})/gi];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(combined))) {
      if (!codes.includes(match[1])) codes.push(match[1]);
    }
  }
  return codes;
}

function attachmentToPhoto(attachment, from) {
  const filename = sanitizeFileName(attachment.filename || attachment.name || attachment.originalName || 'kundenantwort-foto');
  const mimeType = String(attachment.contentType || attachment.content_type || attachment.mimeType || attachment.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) return null;

  let base64 = attachment.content || attachment.data || attachment.body || attachment.base64 || '';
  if (typeof base64 !== 'string') return null;
  if (base64.startsWith('data:')) base64 = base64.split(',')[1] || '';
  base64 = base64.replace(/\s/g, '');
  if (!base64) return null;

  const size = Buffer.from(base64, 'base64').length;
  if (size > MAX_PHOTO_SIZE_BYTES) return null;

  return {
    id: crypto.randomUUID(),
    type: 'customer-reply',
    originalName: filename,
    mimeType,
    size,
    sizeKb: Math.max(1, Math.round(size / 1024)),
    uploadedBy: `Kundenantwort${from ? ' von ' + cleanText(from, 80) : ''}`,
    uploadedAt: new Date().toISOString(),
    uploadedAtLabel: formatBerlinDateTime(),
    dataUrl: `data:${mimeType};base64,${base64}`
  };
}

function findAnfrageByCode(anfragen, codes) {
  for (const code of codes) {
    const cleanCode = String(code || '').replace(/\D/g, '');
    if (!cleanCode) continue;
    const found = anfragen.find(a => String(a.id || '') === cleanCode || String(a.id || '').slice(-6) === cleanCode.slice(-6));
    if (found) return found;
  }
  return null;
}

async function saveInboundCustomerReply(emailData, req) {
  const cleanTextBody = cleanText(emailData.text || stripHtmlToText(emailData.html), 8000);
  const codes = extractRequestCodes(emailData.subject, cleanTextBody, emailData.html);
  const anfragen = await readAnfragen();
  const anfrage = findAnfrageByCode(anfragen, codes);

  if (!anfrage) {
    console.warn('[INBOUND] Kundenantwort konnte keiner Anfrage zugeordnet werden.', { subject: emailData.subject, from: emailData.from, codes });
    return { ok: false, reason: 'request_not_found', codes };
  }

  const photos = emailData.attachments.map(attachment => attachmentToPhoto(attachment, emailData.from)).filter(Boolean);
  const messageId = cleanText(emailData.messageId || '', 300);
  if (messageId && anfragen.some(item => Array.isArray(item.customerReplies) && item.customerReplies.some(reply => reply.sourceMessageId === messageId))) {
    console.log('[INBOUND] Kundenantwort wurde bereits importiert.', { messageId, subject: emailData.subject });
    return { ok: true, duplicate: true, reason: 'already_imported', messageId };
  }

  const reply = {
    id: crypto.randomUUID(),
    sourceMessageId: messageId || undefined,
    from: cleanText(emailData.from, 180) || '-',
    to: cleanText(emailData.to, 180) || '-',
    subject: cleanText(emailData.subject, 300) || '(ohne Betreff)',
    text: cleanTextBody || '(keine Textantwort erkannt)',
    receivedAt: new Date().toISOString(),
    receivedAtLabel: formatBerlinDateTime(),
    photoCount: photos.length,
    attachmentCount: emailData.attachments.length
  };

  anfrage.customerReplies = Array.isArray(anfrage.customerReplies) ? anfrage.customerReplies : [];
  anfrage.customerReplies.unshift(reply);
  anfrage.customerPhotos = Array.isArray(anfrage.customerPhotos) ? anfrage.customerPhotos : [];
  anfrage.customerPhotos.unshift(...photos);

  await createBackup('before-inbound-reply');
  await writeAnfragen(anfragen);
  addActivity(req, 'customer_reply_received', { requestId: anfrage.id, code: getRequestCode(anfrage), from: reply.from, photos: photos.length });
  console.log('[INBOUND] Kundenantwort gespeichert', { requestId: anfrage.id, code: getRequestCode(anfrage), from: reply.from, photos: photos.length });
  return { ok: true, requestId: anfrage.id, code: getRequestCode(anfrage), photos: photos.length };
}


function imapEnabled() {
  return Boolean(process.env.IMAP_HOST && process.env.IMAP_USER && process.env.IMAP_PASS);
}

function quoteImap(value) {
  return '"' + String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

function waitForBuffer(bufferRef, predicate, timeoutMs = 30000, label = 'IMAP') {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      try {
        const value = bufferRef();
        if (predicate(value)) {
          clearInterval(timer);
          resolve(value);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`${label} timeout nach ${timeoutMs}ms`));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, 50);
  });
}

async function createSimpleImapClient() {
  const host = process.env.IMAP_HOST || 'imap.strato.de';
  const port = Number(process.env.IMAP_PORT || 993);
  const secure = String(process.env.IMAP_SECURE || 'true').toLowerCase() !== 'false';
  let buffer = '';
  let tagCounter = 1;

  const socket = secure
    ? tls.connect({ host, port, servername: host })
    : require('net').connect({ host, port });

  socket.setEncoding('utf8');
  socket.on('data', chunk => { buffer += chunk; });

  await new Promise((resolve, reject) => {
    socket.once(secure ? 'secureConnect' : 'connect', resolve);
    socket.once('error', reject);
    setTimeout(() => reject(new Error('IMAP-Verbindung timeout')), 20000);
  });

  await waitForBuffer(() => buffer, text => /\* OK/i.test(text), 20000, 'IMAP Begrüßung');

  async function command(commandText, timeoutMs = 30000) {
    const tag = 'A' + String(tagCounter++).padStart(4, '0');
    const start = buffer.length;
    socket.write(`${tag} ${commandText}\r\n`);
    const all = await waitForBuffer(
      () => buffer,
      text => new RegExp(`\\r?\\n${tag} (OK|NO|BAD)`, 'i').test(text.slice(start)),
      timeoutMs,
      `IMAP ${commandText.split(' ')[0]}`
    );
    const response = all.slice(start);
    if (new RegExp(`\\r?\\n${tag} (NO|BAD)`, 'i').test(response)) {
      throw new Error(`IMAP-Befehl fehlgeschlagen: ${commandText} :: ${response.slice(-500)}`);
    }
    return response;
  }

  return {
    async login() {
      await command(`LOGIN ${quoteImap(process.env.IMAP_USER)} ${quoteImap(process.env.IMAP_PASS)}`, 30000);
    },
    async selectInbox() {
      await command('SELECT INBOX', 30000);
    },
    async searchAll() {
      const response = await command('SEARCH ALL', 30000);
      const match = response.match(/\* SEARCH([^\r\n]*)/i);
      if (!match) return [];
      return match[1].trim().split(/\s+/).filter(Boolean).map(Number).filter(Boolean);
    },
    async fetchRaw(id) {
      const response = await command(`FETCH ${id} BODY.PEEK[]`, 60000);
      const literal = response.match(/\{(\d+)\}\r?\n/);
      if (!literal) return '';
      const size = Number(literal[1]);
      const start = literal.index + literal[0].length;
      return response.slice(start, start + size);
    },
    async logout() {
      try { await command('LOGOUT', 10000); } catch (error) { /* ignore */ }
      socket.end();
    }
  };
}

function decodeMimeWord(charset, encoding, value) {
  try {
    const enc = String(encoding || '').toUpperCase();
    let buffer;
    if (enc === 'B') {
      buffer = Buffer.from(value, 'base64');
    } else {
      const q = value.replace(/_/g, ' ').replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      buffer = Buffer.from(q, 'binary');
    }
    const cs = String(charset || '').toLowerCase();
    if (cs.includes('iso-8859-1') || cs.includes('latin1')) return buffer.toString('latin1');
    return buffer.toString('utf8');
  } catch (error) {
    return value;
  }
}

function decodeMimeHeader(value) {
  return String(value || '')
    .replace(/\r?\n[ \t]+/g, ' ')
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]+)\?=/g, (_, charset, encoding, text) => decodeMimeWord(charset, encoding, text))
    .trim();
}

function parseEmailHeaders(rawHeaders) {
  const headers = {};
  const unfolded = String(rawHeaders || '').replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index === -1) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (!headers[key]) headers[key] = value;
    else headers[key] += ', ' + value;
  }
  return headers;
}

function decodeTransferBody(body, encoding) {
  const enc = String(encoding || '').toLowerCase();
  const text = String(body || '').replace(/^\s+|\s+$/g, '');
  if (enc === 'base64') {
    try { return Buffer.from(text.replace(/\s/g, ''), 'base64').toString('utf8'); } catch (error) { return text; }
  }
  if (enc === 'quoted-printable') {
    return text
      .replace(/=\r?\n/g, '')
      .replace(/=([A-Fa-f0-9]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return String(body || '').trim();
}

function getHeaderParam(headerValue, paramName) {
  const pattern = new RegExp(`${paramName}\\*?=(?:\"([^\"]+)\"|([^;]+))`, 'i');
  const match = String(headerValue || '').match(pattern);
  return decodeMimeHeader((match && (match[1] || match[2])) || '');
}

function splitRawEmail(raw) {
  const normalized = String(raw || '').replace(/\r\n/g, '\n');
  const index = normalized.indexOf('\n\n');
  if (index === -1) return { headers: {}, body: normalized };
  return {
    headers: parseEmailHeaders(normalized.slice(0, index)),
    body: normalized.slice(index + 2)
  };
}

function parseMimeParts(headers, body, result) {
  const contentType = headers['content-type'] || 'text/plain';
  const transfer = headers['content-transfer-encoding'] || '';
  const disposition = headers['content-disposition'] || '';
  const boundary = getHeaderParam(contentType, 'boundary');

  if (/multipart\//i.test(contentType) && boundary) {
    const parts = String(body || '').split(new RegExp(`--${boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?\\s*`, 'g'));
    for (const part of parts) {
      if (!part.trim() || part.trim() === '--') continue;
      const parsed = splitRawEmail(part);
      parseMimeParts(parsed.headers, parsed.body, result);
    }
    return;
  }

  const filename = getHeaderParam(disposition, 'filename') || getHeaderParam(contentType, 'name');
  const mimeType = String(contentType.split(';')[0] || '').trim().toLowerCase();

  if (mimeType === 'text/plain' && !filename) {
    result.textParts.push(decodeTransferBody(body, transfer));
    return;
  }

  if (mimeType === 'text/html' && !filename) {
    result.htmlParts.push(decodeTransferBody(body, transfer));
    return;
  }

  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    let base64 = String(body || '').trim();
    if (String(transfer).toLowerCase() !== 'base64') {
      const decoded = decodeTransferBody(body, transfer);
      base64 = Buffer.from(decoded, 'binary').toString('base64');
    }
    result.attachments.push({
      filename: filename || 'kundenantwort-foto',
      contentType: mimeType,
      content: base64.replace(/\s/g, '')
    });
  }
}

function parseRawEmail(raw) {
  const parsed = splitRawEmail(raw);
  const result = { textParts: [], htmlParts: [], attachments: [] };
  parseMimeParts(parsed.headers, parsed.body, result);
  const from = decodeMimeHeader(parsed.headers.from || '');
  const to = decodeMimeHeader(parsed.headers.to || '');
  const subject = decodeMimeHeader(parsed.headers.subject || '');
  const messageId = cleanText(parsed.headers['message-id'] || crypto.createHash('sha1').update(String(raw || '')).digest('hex'), 300);
  const text = result.textParts.join('\n\n').trim() || stripHtmlToText(result.htmlParts.join('\n\n'));
  const html = result.htmlParts.join('\n\n').trim();
  return { from, to, subject, text, html, attachments: result.attachments, messageId };
}

async function fetchCustomerRepliesFromImap(req) {
  if (!imapEnabled()) {
    throw new Error('IMAP ist nicht eingerichtet. Bitte IMAP_HOST, IMAP_USER und IMAP_PASS bei Render setzen.');
  }

  const client = await createSimpleImapClient();
  const limit = Number(process.env.IMAP_FETCH_LIMIT || 30);
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  let checked = 0;

  try {
    await client.login();
    await client.selectInbox();
    const ids = await client.searchAll();
    const latest = ids.slice(-limit).reverse();

    for (const id of latest) {
      checked += 1;
      const raw = await client.fetchRaw(id);
      if (!raw) { skipped += 1; continue; }
      const emailData = parseRawEmail(raw);
      const result = await saveInboundCustomerReply(emailData, req);
      if (result.duplicate) duplicates += 1;
      else if (result.ok) imported += 1;
      else skipped += 1;
    }
  } finally {
    await client.logout();
  }

  return { imported, duplicates, skipped, checked };
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

app.use('/webhooks/resend', express.json({ limit: '50mb' }));
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

app.post('/anfrage', formLimiter, handleUpload(upload.array('customerPhotos', 5)), async (req, res) => {
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

  const customerPhotos = filesToPhotoObjects(req.files || [], name || 'Kunde', 'customer');
  const photoSignature = customerPhotos.map(photo => `${photo.originalName}:${photo.size}`).join('|');

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
    kontaktart,
    photoSignature
  });

  const anfragen = await readAnfragen();
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
    customerPhotos,
    beforePhotos: [],
    afterPhotos: [],
    internalNotes: [],
    customerReplies: [],
    status: 'Neu',
    datum: formatBerlinDateTime()
  };

  await createBackup('before-create');
  anfragen.unshift(neueAnfrage);
  await writeAnfragen(anfragen);
  addActivity(req, 'request_created', { requestId: neueAnfrage.id, name: neueAnfrage.name, leistung: neueAnfrage.kategorie });

  await sendCustomerConfirmation(neueAnfrage);
  await sendAdminNotification(neueAnfrage);

  res.redirect('/?success=1');
});


app.post('/webhooks/resend/inbound', async (req, res) => {
  try {
    if (!verifyInboundWebhookToken(req)) return res.status(401).json({ ok: false, error: 'invalid_token' });
    const emailData = extractInboundPayload(req.body || {});
    const result = await saveInboundCustomerReply(emailData, req);
    return res.status(result.ok ? 200 : 202).json(result);
  } catch (error) {
    console.error('[INBOUND] Webhook-Fehler:', error);
    return res.status(500).json({ ok: false, error: 'inbound_processing_failed' });
  }
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', loginLimiter, async (req, res) => {
  const username = cleanText(req.body.username, 80);
  const password = String(req.body.password || '');

  const admin = await authenticateAdmin(username, password);
  if (admin) {
    req.session.loggedIn = true;
    req.session.username = admin.username;
    req.session.adminId = admin.id;
    req.session.role = admin.role;
    addActivity(req, 'login_success', { username: admin.username, role: admin.role });
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


app.post('/admin/fetch-mails', requireLogin, requireRole('owner', 'admin', 'mitarbeiter'), verifyCsrf, async (req, res) => {
  try {
    const result = await fetchCustomerRepliesFromImap(req);
    addActivity(req, 'imap_replies_fetched', result);
    const message = `E-Mails geprüft: ${result.checked}. Neu importiert: ${result.imported}. Bereits vorhanden: ${result.duplicates}. Nicht zugeordnet: ${result.skipped}.`;
    res.redirect('/admin?mailSync=' + encodeURIComponent(message));
  } catch (error) {
    console.error('[IMAP] Abruf fehlgeschlagen:', error);
    res.redirect('/admin?mailError=' + encodeURIComponent(error.message || 'E-Mail-Abruf fehlgeschlagen.'));
  }
});

app.get('/admin', requireLogin, async (req, res) => {
  const anfragen = await readAnfragen();
  const suche = (req.query.suche || '').toLowerCase();
  const gefiltert = suche
    ? anfragen.filter(a =>
        String(a.name || '').toLowerCase().includes(suche) ||
        String(a.email || '').toLowerCase().includes(suche) ||
        String(a.telefon || '').toLowerCase().includes(suche) ||
        String(a.kategorie || '').toLowerCase().includes(suche) ||
        String(a.nachricht || '').toLowerCase().includes(suche) ||
        String(a.status || '').toLowerCase().includes(suche)
      )
    : anfragen;

  const permissions = getPermissions(req.session.role);
  res.render('admin', {
    anfragen: gefiltert,
    suche: req.query.suche || '',
    username: req.session.username || 'Admin',
    userRole: permissions.role,
    roleLabel: permissions.roleLabel,
    permissions,
    csrfToken: createCsrfToken(req),
    activityLog: permissions.canViewActivity ? readActivityLog(10) : [],
    backups: permissions.canDownloadBackups ? listBackups(20) : [],
    mailSync: req.query.mailSync || '',
    mailError: req.query.mailError || '',
    imapReady: imapEnabled()
  });
});

app.get('/admin/backups/:filename', requireLogin, requireRole('owner', 'admin'), (req, res) => {
  const backup = getSafeBackupPath(req.params.filename);
  if (!backup) return res.status(404).send('Backup wurde nicht gefunden.');

  addActivity(req, 'backup_downloaded', { file: backup.safeName });
  res.download(backup.fullPath, backup.safeName);
});

app.get('/admin/activity-log/download', requireLogin, requireRole('owner'), (req, res) => {
  if (!fs.existsSync(ACTIVITY_LOG_FILE)) return res.status(404).send('Aktivitätsprotokoll wurde nicht gefunden.');

  addActivity(req, 'activity_log_downloaded');
  res.download(ACTIVITY_LOG_FILE, 'activity-log.json');
});

app.get('/admin/users', requireLogin, requireRole('owner'), async (req, res) => {
  const message = req.query.message || '';
  const error = req.query.error || '';
  const users = await listAdminUsers();

  res.render('users', {
    users,
    username: req.session.username || 'Admin',
    userRole: req.session.role || 'admin',
    csrfToken: createCsrfToken(req),
    message,
    error,
    postgresEnabled: Boolean(pool)
  });
});

app.post('/admin/users/create', requireLogin, requireRole('owner'), verifyCsrf, async (req, res) => {
  try {
    await createAdminUser({
      username: req.body.username,
      password: req.body.password,
      role: req.body.role,
      createdBy: req.session.username
    });
    addActivity(req, 'admin_user_created', { username: cleanText(req.body.username, 80), role: normalizeRole(req.body.role) });
    res.redirect('/admin/users?message=Benutzer wurde erstellt.');
  } catch (error) {
    res.redirect('/admin/users?error=' + encodeURIComponent(error.message || 'Benutzer konnte nicht erstellt werden.'));
  }
});

app.post('/admin/users/:id/role', requireLogin, requireRole('owner'), verifyCsrf, async (req, res) => {
  try {
    const id = String(req.params.id);
    const role = normalizeRole(req.body.role);
    const users = await listAdminUsers();
    const target = users.find(user => user.id === id);
    if (!target) throw new Error('Benutzer wurde nicht gefunden.');
    if (target.id === req.session.adminId && role !== 'owner') throw new Error('Du kannst dir selbst nicht die Owner-Rechte entfernen.');
    if (target.role === 'owner' && role !== 'owner' && await countActiveOwners(target.id) < 1) throw new Error('Es muss mindestens ein aktiver Owner bleiben.');

    await pool.query('UPDATE admin_users SET role = $1 WHERE id = $2', [role, id]);
    addActivity(req, 'admin_user_role_changed', { username: target.username, oldRole: target.role, newRole: role });
    res.redirect('/admin/users?message=Rolle wurde geändert.');
  } catch (error) {
    res.redirect('/admin/users?error=' + encodeURIComponent(error.message || 'Rolle konnte nicht geändert werden.'));
  }
});

app.post('/admin/users/:id/password', requireLogin, requireRole('owner'), verifyCsrf, async (req, res) => {
  try {
    const id = String(req.params.id);
    const password = String(req.body.password || '');
    if (password.length < 8) throw new Error('Passwort muss mindestens 8 Zeichen lang sein.');
    const users = await listAdminUsers();
    const target = users.find(user => user.id === id);
    if (!target) throw new Error('Benutzer wurde nicht gefunden.');

    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query('UPDATE admin_users SET password_hash = $1 WHERE id = $2', [passwordHash, id]);
    addActivity(req, 'admin_user_password_changed', { username: target.username });
    res.redirect('/admin/users?message=Passwort wurde geändert.');
  } catch (error) {
    res.redirect('/admin/users?error=' + encodeURIComponent(error.message || 'Passwort konnte nicht geändert werden.'));
  }
});

app.post('/admin/users/:id/toggle', requireLogin, requireRole('owner'), verifyCsrf, async (req, res) => {
  try {
    const id = String(req.params.id);
    const users = await listAdminUsers();
    const target = users.find(user => user.id === id);
    if (!target) throw new Error('Benutzer wurde nicht gefunden.');
    if (target.id === req.session.adminId) throw new Error('Du kannst dich selbst nicht deaktivieren.');
    if (target.role === 'owner' && target.active && await countActiveOwners(target.id) < 1) throw new Error('Es muss mindestens ein aktiver Owner bleiben.');

    await pool.query('UPDATE admin_users SET active = NOT active WHERE id = $1', [id]);
    addActivity(req, 'admin_user_toggled', { username: target.username, wasActive: target.active });
    res.redirect('/admin/users?message=Benutzerstatus wurde geändert.');
  } catch (error) {
    res.redirect('/admin/users?error=' + encodeURIComponent(error.message || 'Benutzerstatus konnte nicht geändert werden.'));
  }
});

app.post('/admin/users/:id/delete', requireLogin, requireRole('owner'), verifyCsrf, async (req, res) => {
  try {
    const id = String(req.params.id);
    const users = await listAdminUsers();
    const target = users.find(user => user.id === id);
    if (!target) throw new Error('Benutzer wurde nicht gefunden.');
    if (target.id === req.session.adminId) throw new Error('Du kannst dich selbst nicht löschen.');
    if (target.role === 'owner' && await countActiveOwners(target.id) < 1) throw new Error('Es muss mindestens ein aktiver Owner bleiben.');

    await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);
    addActivity(req, 'admin_user_deleted', { username: target.username, role: target.role });
    res.redirect('/admin/users?message=Benutzer wurde gelöscht.');
  } catch (error) {
    res.redirect('/admin/users?error=' + encodeURIComponent(error.message || 'Benutzer konnte nicht gelöscht werden.'));
  }
});


app.post('/admin/note/:id', requireLogin, requireRole('owner', 'admin', 'mitarbeiter'), verifyCsrf, async (req, res) => {
  const noteText = cleanMultiline(req.body.note, 1500);
  if (!noteText) return res.redirect('/admin');

  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);
  if (anfrage) {
    anfrage.internalNotes = Array.isArray(anfrage.internalNotes) ? anfrage.internalNotes : [];
    anfrage.internalNotes.unshift({
      id: crypto.randomUUID(),
      text: noteText,
      createdBy: req.session.username || 'Admin',
      createdAt: new Date().toISOString(),
      createdAtLabel: formatBerlinDateTime()
    });
    await createBackup('before-note');
    await writeAnfragen(anfragen);
    addActivity(req, 'internal_note_added', { requestId: anfrage.id, name: anfrage.name });
  }

  res.redirect('/admin#request-' + encodeURIComponent(req.params.id));
});


app.get('/admin/photo/:id/:photoId', requireLogin, async (req, res) => {
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);
  const found = findPhotoInAnfrage(anfrage, req.params.photoId);
  const file = photoToBuffer(found?.photo);

  if (!file) return res.status(404).send('Foto wurde nicht gefunden.');

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/"/g, '')}"`);
  return res.send(file.buffer);
});

app.get('/admin/photo/:id/:photoId/download', requireLogin, async (req, res) => {
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);
  const found = findPhotoInAnfrage(anfrage, req.params.photoId);
  const file = photoToBuffer(found?.photo);

  if (!file) return res.status(404).send('Foto wurde nicht gefunden.');

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Length', file.buffer.length);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', `attachment; filename="${file.fileName.replace(/"/g, '')}"`);
  return res.send(file.buffer);
});

app.post('/admin/photos/:id/:type', requireLogin, requireRole('owner', 'admin', 'mitarbeiter'), verifyCsrf, handleUpload(upload.array('workPhotos', 8)), async (req, res) => {
  const type = req.params.type === 'after' ? 'after' : 'before';
  const key = type === 'after' ? 'afterPhotos' : 'beforePhotos';
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);

  if (anfrage && req.files && req.files.length > 0) {
    anfrage[key] = Array.isArray(anfrage[key]) ? anfrage[key] : [];
    const photos = filesToPhotoObjects(req.files, req.session.username || 'Admin', type);
    anfrage[key].unshift(...photos);
    await createBackup(`before-${type}-photos`);
    await writeAnfragen(anfragen);
    addActivity(req, type === 'after' ? 'after_photos_uploaded' : 'before_photos_uploaded', {
      requestId: anfrage.id,
      name: anfrage.name,
      count: photos.length
    });
  }

  res.redirect('/admin#request-' + encodeURIComponent(req.params.id));
});

app.post('/admin/photos/:id/:type/:photoId/delete', requireLogin, requireRole('owner', 'admin'), verifyCsrf, async (req, res) => {
  const type = req.params.type === 'after' ? 'after' : req.params.type === 'customer' ? 'customer' : 'before';
  const key = type === 'after' ? 'afterPhotos' : type === 'customer' ? 'customerPhotos' : 'beforePhotos';
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);

  if (anfrage && Array.isArray(anfrage[key])) {
    const beforeCount = anfrage[key].length;
    anfrage[key] = anfrage[key].filter(photo => photo.id !== req.params.photoId);
    if (anfrage[key].length !== beforeCount) {
      await createBackup('before-photo-delete');
      await writeAnfragen(anfragen);
      addActivity(req, 'photo_deleted', { requestId: anfrage.id, type, photoId: req.params.photoId });
    }
  }

  res.redirect('/admin#request-' + encodeURIComponent(req.params.id));
});

app.post('/admin/status/:id', requireLogin, verifyCsrf, async (req, res) => {
  const anfragen = await readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);
  if (anfrage) {
    const oldStatus = anfrage.status || 'Neu';
    const allowedStatuses = ['Neu', 'In Bearbeitung', 'Erledigt'];
    const newStatus = allowedStatuses.includes(req.body.status) ? req.body.status : oldStatus;
    anfrage.status = newStatus;
    await createBackup('before-status');
    await writeAnfragen(anfragen);
    addActivity(req, 'status_changed', { requestId: anfrage.id, name: anfrage.name, oldStatus, newStatus });
    await sendStatusEmail(anfrage, oldStatus, newStatus);
  }
  res.redirect('/admin');
});

app.post('/admin/delete/:id', requireLogin, requireRole('owner', 'admin'), verifyCsrf, async (req, res) => {
  const before = await readAnfragen();
  const deleted = before.find(a => a.id === req.params.id);
  const anfragen = before.filter(a => a.id !== req.params.id);
  await createBackup('before-delete');
  await writeAnfragen(anfragen);
  if (deleted) addActivity(req, 'request_deleted', { requestId: deleted.id, name: deleted.name, leistung: deleted.kategorie });
  res.redirect('/admin');
});

ensureDatabase()
  .then(() => {
    console.log(`[DB] Speicher: ${usePostgres ? 'PostgreSQL' : 'JSON-Datei'}`);
    console.log(`[ADMIN] User-Verwaltung: ${usePostgres ? 'PostgreSQL aktiv' : 'nur Environment-Fallback'}`);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Admin-Dashboard: /admin`);
      console.log(`[MAIL] MAIL_ENABLED=${process.env.MAIL_ENABLED || 'nicht gesetzt'}, PROVIDER=Resend, RESEND_API_KEY=${process.env.RESEND_API_KEY ? 'gesetzt' : 'nicht gesetzt'}, MAIL_FROM=${getMailFrom() || 'nicht gesetzt'}, ADMIN_EMAIL=${process.env.ADMIN_EMAIL || 'nicht gesetzt'}`);
    });
  })
  .catch(error => {
    console.error('[DB] Datenbank konnte nicht initialisiert werden:', error);
    process.exit(1);
  });
