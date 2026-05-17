# Statusbereich Notfall-Zurücksetzen

Dieses Script stellt `views/admin.ejs` aus einem vorhandenen Backup wieder her und entfernt die letzten kaputten Status-Final-Einbindungen.

## Ausführen

```bash
node scripts/statusbereich-notfall-zuruecksetzen.js
```

Danach:

```bash
git add .
git commit -m "Statusbereich Notfall Restore"
git push
```

## Wichtig

Das Script macht vorher selbst ein Backup der aktuellen defekten Datei:

`views/admin.ejs.backup-current-broken-status-...`
