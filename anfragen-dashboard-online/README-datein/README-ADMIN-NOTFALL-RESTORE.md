# Admin EJS Notfall-Restore

Dieses Script behebt den aktuellen `Internal Server Error`, wenn `views/admin.ejs` durch ein Update einen EJS-Syntaxfehler bekommen hat.

## Nutzung

1. ZIP entpacken
2. Datei in den Projektordner legen:

```text
scripts/admin-ejs-notfall-restore.js
```

3. In Git Bash im Projektordner ausführen:

```bash
node scripts/admin-ejs-notfall-restore.js
```

4. Danach hochladen:

```bash
git add .
git commit -m "Admin Dashboard Notfall Restore"
git push
```

Das Script sucht automatisch nach `views/admin.ejs.backup...`, prüft die Backups und stellt die neueste gültige Version wieder her.
