# Admin-User und Rollen

Diese Version ergänzt eine User-Verwaltung im Admin-Dashboard.

## Neue Seite

Nur Owner sehen im Dashboard den Button:

```text
User verwalten
```

Die Seite ist erreichbar unter:

```text
/admin/users
```

## Rollen

### Owner

Darf alles:

- Anfragen ansehen
- Status ändern
- Anfragen löschen
- Backups herunterladen
- Aktivitätsprotokoll ansehen
- neue User anlegen
- Rollen ändern
- Passwörter anderer User ändern
- User deaktivieren oder löschen

### Admin

Darf:

- Anfragen ansehen
- Status ändern
- Anfragen löschen
- Backups herunterladen

Darf nicht:

- User verwalten
- Aktivitätsprotokoll herunterladen

### Mitarbeiter

Darf:

- Anfragen ansehen
- Status ändern

Darf nicht:

- Anfragen löschen
- Backups herunterladen
- User verwalten

## Sicherheit

Passwörter neuer User werden mit bcrypt gehasht und nicht im Klartext gespeichert.

## Start-Owner

Wenn die Tabelle `admin_users` leer ist, übernimmt der Server beim ersten Start die Admin-Daten aus den Render Environment Variables:

```env
ADMIN_USERNAME=...
ADMIN_PASSWORD=...
```

oder:

```env
ADMINS=Oliver:Passwort123,Frederik:Passwort456
```

Der erste angelegte User bekommt automatisch die Rolle `owner`, wenn noch kein Owner existiert.
