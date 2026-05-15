require('dotenv').config();

const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'anfragen.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

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

function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.redirect('/login');
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bitte-aendern',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 8
  }
}));

app.get('/', (req, res) => {
  res.render('kontakt', { success: false });
});

app.post('/anfrage', (req, res) => {
  const { name, email, telefon, kategorie, nachricht } = req.body;

  if (!name || !email || !nachricht) {
    return res.status(400).send('Name, E-Mail und Nachricht sind Pflichtfelder.');
  }

  const anfragen = readAnfragen();
  anfragen.unshift({
    id: Date.now().toString(),
    name,
    email,
    telefon: telefon || '',
    kategorie: kategorie || 'Sonstiges',
    nachricht,
    status: 'Neu',
    datum: new Date().toLocaleString('de-DE')
  });

  writeAnfragen(anfragen);
  res.render('kontakt', { success: true });
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    req.session.loggedIn = true;
    return res.redirect('/admin');
  }

  res.render('login', { error: 'Benutzername oder Passwort ist falsch.' });
});

app.post('/logout', (req, res) => {
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

  res.render('admin', { anfragen: gefiltert, suche: req.query.suche || '' });
});

app.post('/admin/status/:id', requireLogin, (req, res) => {
  const anfragen = readAnfragen();
  const anfrage = anfragen.find(a => a.id === req.params.id);
  if (anfrage) anfrage.status = req.body.status;
  writeAnfragen(anfragen);
  res.redirect('/admin');
});

app.post('/admin/delete/:id', requireLogin, (req, res) => {
  const anfragen = readAnfragen().filter(a => a.id !== req.params.id);
  writeAnfragen(anfragen);
  res.redirect('/admin');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server läuft auf Port ${PORT}`);
  console.log(`Admin-Dashboard: /admin`);
});
