# Zahlungswunsch Crash Fix

Behebt den Fehler:

ReferenceError: zahlungswunsch is not defined

## Anwendung

Im Projektordner ausführen:

```bash
node scripts/zahlungswunsch-crash-fix.js
```

Danach:

```bash
git add .
git commit -m "Zahlungswunsch Fehler behoben"
git push
```

Das Script erstellt vorher ein Backup:

`server.js.backup-before-zahlungswunsch-crash-fix`
