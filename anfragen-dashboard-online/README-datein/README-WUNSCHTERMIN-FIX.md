# Wunschtermin-Uhrzeit Fix

Dieses Update macht die Uhrzeit-Auswahl im Kundenformular robuster.

## Verbessert

- Nach Auswahl eines Datums lädt die Uhrzeit-Auswahl zuverlässiger.
- Belegte Uhrzeiten werden als „belegt“ angezeigt und deaktiviert.
- Wenn die Kalender-API kurz nicht erreichbar ist, werden Standard-Uhrzeiten angezeigt.
- Der Server prüft beim Absenden trotzdem nochmal, ob der Termin wirklich frei ist.

## Datei ersetzen

Nur diese Datei ersetzen:

```text
views/kontakt.ejs
```

## Nicht ersetzen

```text
server.js
views/admin.ejs
public/style.css
.env
node_modules
```

## Hochladen

```bash
git add .
git commit -m "Wunschtermin Uhrzeit Auswahl korrigiert"
git push
```
