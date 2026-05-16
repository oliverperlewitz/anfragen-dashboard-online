# Auftragsakte Route reparieren

Der Fehler `Cannot GET /admin/requests/.../archive.zip` bedeutet:

Der Button ist im Dashboard sichtbar, aber die passende Server-Route fehlt.

## Einbau

Datei hinzufügen:

- `scripts/auftragsakte-route-reparieren.js`

Dann im Projektordner ausführen:

```bash
node scripts/auftragsakte-route-reparieren.js
npm install
git add .
git commit -m "Auftragsakte Route repariert"
git push
```

Das Script erstellt vorher Backups von `server.js` und `package.json` und prüft die Syntax.
