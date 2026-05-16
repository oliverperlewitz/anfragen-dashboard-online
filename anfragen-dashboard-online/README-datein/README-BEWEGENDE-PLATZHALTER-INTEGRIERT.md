# Bewegende Platzhalter – fertig zum Einbauen

Dieses Paket fügt bewegende Platzhalter in das Kundenformular ein.
Wenn ein Text im Eingabefeld zu lang ist, wartet er kurz und bewegt sich dann langsam, damit der Kunde den ganzen Hinweis lesen kann.

## Dateien hinzufügen

Kopiere diese Dateien in dein Projekt:

- `public/placeholder-scroll.css`
- `public/placeholder-scroll.js`
- `scripts/platzhalter-einbauen.js`

## Danach einmal ausführen

Im Projektordner in Git Bash:

```bash
node scripts/platzhalter-einbauen.js
```

Das Script trägt automatisch in `views/kontakt.ejs` ein:

```html
<link rel="stylesheet" href="/placeholder-scroll.css">
<script src="/placeholder-scroll.js" defer></script>
```

## Ersetzen?

Es muss nichts ersetzt werden. Diese Dateien werden nur neu hinzugefügt.
`views/kontakt.ejs` wird automatisch angepasst und vorher als Backup gesichert:

- `views/kontakt.ejs.backup-before-placeholder`

## Danach hochladen

```bash
git add .
git commit -m "Bewegende Platzhalter im Kontaktformular eingebaut"
git push
```
