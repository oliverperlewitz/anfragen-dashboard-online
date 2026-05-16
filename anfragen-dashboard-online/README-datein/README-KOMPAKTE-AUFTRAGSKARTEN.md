# Kompakte Auftragskarten im Dashboard

Dieses Update macht die Auftragskarten im Admin-Dashboard übersichtlicher.

Standardmäßig sieht man pro Auftrag nur:

- Status
- Name
- Datum
- Ticketnummer

Beim Klick auf die Karte öffnen sich alle weiteren Informationen, Bearbeitungsfelder, Fotos, Notizen, Kundenantworten und Statusfunktionen.

## Dateien

Ersetzen:

- `views/admin.ejs`
- `public/style.css`

## Deploy

```bash
git add .
git commit -m "Auftragskarten kompakt und aufklappbar gemacht"
git push
```
