# Sicherheits-Version

Diese Version ergänzt:

- CSRF-Schutz für Admin-Aktionen wie Status ändern, Löschen und Logout
- Passwort-Hash-Unterstützung mit bcryptjs
- bessere Formularprüfung für Name, Telefon, E-Mail, Budget und Textlängen
- Admin-Aktivitätsprotokoll unter `data/activity-log.json`
- automatisches Backup-System unter `data/backups`
- Security Headers, Rate Limits, Wartungsmodus und sichere Sessions

## Nach dem Ersetzen der Dateien

```bash
npm install
npm start
```

## Passwort-Hash erzeugen

Im Projektordner:

```bash
node -e "const bcrypt=require('bcryptjs'); console.log(bcrypt.hashSync('DEIN_PASSWORT', 12));"
```

Dann in `.env` oder bei Render Environment Variables eintragen:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$12$...
```

Für mehrere Admins:

```env
ADMINS_HASHED=admin:$2a$12$...,max:$2a$12$...
```

Die alte einfache Variante `ADMIN_PASSWORD` oder `ADMINS=admin:passwort` funktioniert weiter, ist aber weniger sicher.

## Backups

Vor Änderungen an Anfragen wird automatisch ein Backup erstellt:

```text
data/backups/
```

Die Anzahl steuerst du mit:

```env
MAX_BACKUPS=50
```
