# Wunschtermin schöner + Uhrzeit-Fix

Dieses Update macht die Wunschtermin-Auswahl auf der Kundenwebsite schöner und stabiler.

## Neu

- Datumsauswahl bleibt links
- Uhrzeiten werden als große klickbare Karten angezeigt
- Belegte Uhrzeiten werden sichtbar deaktiviert
- Wenn die Kalender-API kurz nicht lädt, werden trotzdem Standard-Uhrzeiten angezeigt
- Das Formular speichert die gewählte Uhrzeit weiterhin im Feld `wunschUhrzeit`

## Dateien

Ersetzen:

- `views/kontakt.ejs`

Neu hinzufügen:

- `public/wunschtermin.css`

Nicht ersetzen:

- `server.js`
- `views/admin.ejs`
- `public/style.css`

## Danach

```bash
git add .
git commit -m "Wunschtermin Auswahl schoener und stabiler gemacht"
git push
```
