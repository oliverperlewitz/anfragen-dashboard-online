# Notfall-Fix: Rechnungsupdate zurücksetzen

Dein Deploy ist fehlgeschlagen wegen eines Syntaxfehlers in `server.js`.
Dieses Script stellt die Dateien aus den automatisch erstellten Backups wieder her.

## Ausführen

```bash
node scripts/rechnung-notfall-zuruecksetzen.js
```

Danach:

```bash
git add .
git commit -m "Rechnungsfehler zurueckgesetzt"
git push
```

## Stellt wieder her

- server.js
- views/admin.ejs
- public/style.css
- package.json

Nur wenn zu diesen Dateien ein Backup mit `.backup-before-invoices-...` existiert.
