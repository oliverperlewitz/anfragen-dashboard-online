# Anfragen-Dashboard online stellen

Diese Version ist vorbereitet für Online-Hosting bei Render oder Railway.

## Lokal starten

```bash
npm install
copy .env.example .env
npm start
```

## Wichtige Environment Variables beim Hoster

Nicht die `.env` Datei hochladen. Beim Hoster im Bereich "Environment Variables" oder "Variables" eintragen:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=dein-sicheres-passwort
SESSION_SECRET=ein-langer-geheimer-zufallstext
```

Optional:

```env
NODE_VERSION=22
```

## Start Command

```bash
npm start
```

## Hinweis zu gespeicherten Anfragen

Diese einfache Version speichert Anfragen in einer JSON-Datei. Für echtes dauerhaftes Hosting ist später eine Datenbank besser, weil manche Hoster Dateispeicher bei Neustarts/Deployments zurücksetzen können.
