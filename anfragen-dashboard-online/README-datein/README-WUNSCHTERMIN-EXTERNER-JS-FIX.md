# Wunschtermin Uhrzeit Fix

Dieses Update verschiebt die Wunschtermin-Logik aus dem Inline-Script in `public/wunschtermin.js`.
Dadurch wird die Uhrzeit-Auswahl nicht mehr durch Security-Header/CSP blockiert.

## Dateien ersetzen/hinzufügen

- `views/kontakt.ejs` ersetzen
- `public/wunschtermin.css` ersetzen oder hinzufügen
- `public/wunschtermin.js` neu hinzufügen

## Danach

```bash
git add .
git commit -m "Wunschtermin Uhrzeiten zuverlässig geladen"
git push
```

Danach Render deployen lassen und die öffentliche Website neu laden.
