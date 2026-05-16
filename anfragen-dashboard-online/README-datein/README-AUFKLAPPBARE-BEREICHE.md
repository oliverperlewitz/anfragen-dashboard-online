# Aufklappbare Bereiche im Admin-Dashboard

Dieses Update macht im Admin-Dashboard folgende Bereiche einklappbar:

- Fotos & Nachweise
- Interne Notizen

Die Bereiche funktionieren jetzt wie „Details zum Auftrag anzeigen“:

- Klick auf die Überschrift öffnet den Bereich.
- Nochmaliger Klick schließt den Bereich.
- Kunden sehen die internen Notizen weiterhin nicht.
- Foto-Upload, Foto-Download und Notizen bleiben unverändert.

Zu ersetzen:

- `views/admin.ejs`
- `public/style.css`

Danach:

```bash
git add .
git commit -m "Fotos und Notizen einklappbar gemacht"
git push
```
