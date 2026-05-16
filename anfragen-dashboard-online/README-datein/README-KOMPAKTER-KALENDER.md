# Kompakter Kalender – Tagesansicht

Dieses Update macht den Kalender im Admin-Dashboard platzsparender.

## Ersetzen

- `views/admin.ejs`
- `public/style.css`

## Was geändert wurde

- Der Kalender zeigt zuerst nur kompakte Tageskarten.
- Jede Tageskarte zeigt, ob es freie Slots, mögliche Aufträge oder bestätigte Termine gibt.
- Erst beim Klick auf einen Tag erscheinen die Uhrzeiten und Termine.
- Drag & Drop auf freie Uhrzeiten bleibt erhalten.
- Die Serverlogik, Datenbank, E-Mails, Fotos und Benutzerverwaltung werden nicht geändert.
