# Rechnung & Barzahlung Lite

Dieses Update baut Rechnungen sicher neu auf, ohne `server.js` zu verändern.

## Was es kann

- Bereich „Zahlung & Rechnung“ pro Auftrag im Dashboard
- Rechnung / Überweisung
- Barzahlung / Quittung
- Kartenzahlung / Sonstiges
- Positionen eintragen
- PDF im Browser erzeugen: im Druckfenster „Als PDF speichern“ wählen
- E-Mail vorbereiten; PDF muss manuell angehängt werden

## Dateien hinzufügen

- `public/invoice-lite.css`
- `public/invoice-lite.js`
- `scripts/rechnung-lite-einbauen.js`

## Einbau

Im Projektordner ausführen:

```bash
node scripts/rechnung-lite-einbauen.js
```

Dann:

```bash
git add .
git commit -m "Rechnung und Barzahlung Lite hinzugefuegt"
git push
```

## Wichtig

Dieses Update verändert nicht:

- `server.js`
- Datenbank
- E-Mail-Abruf
- Login
- Fotos
- Status-Mails

Es ist deshalb deutlich sicherer als das vorherige Rechnungsupdate.
