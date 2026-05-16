# Anfragen-Dashboard Einfach

Diese Version nutzt keine SQLite-Datenbank und braucht deshalb keine Visual-Studio-Build-Tools.
Die Anfragen werden in der Datei `data/anfragen.json` gespeichert.

## Start

1. `.env.example` zu `.env` kopieren:

```bash
copy .env.example .env
```

2. `.env` öffnen und Passwort ändern.

3. Pakete installieren:

```bash
npm install
```

4. Starten:

```bash
npm start
```

5. Öffnen:

Kontaktformular:
http://localhost:3000

Admin:
http://localhost:3000/admin
