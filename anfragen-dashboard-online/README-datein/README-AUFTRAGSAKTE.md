# Auftragsakte / Nachweis-ZIP

Dieses Update ergänzt im Dashboard einen Button:

`Auftragsakte herunterladen`

Damit wird pro Auftrag eine ZIP-Datei erzeugt, z. B.:

`GW-2026-038872-Auftragsakte.zip`

## Inhalt der ZIP

- `01-Auftragsdaten.pdf`
- `02-Rechnung-Zahlung.pdf`
- `03-Kundenfotos/`
- `04-Vorher-Fotos/`
- `05-Nachher-Fotos/`
- `06-Interne-Notizen.pdf`
- `07-Kundenantworten.pdf`
- `08-Statusverlauf.pdf`
- `09-Zahlungsnachweis.pdf`
- `99-Rohdaten-Auftrag.json`

## Dateien

Neu hinzufügen:

- `scripts/auftragsakte-einbauen.js`

## Einbau

Im Projektordner ausführen:

```bash
node scripts/auftragsakte-einbauen.js
npm install
git add .
git commit -m "Auftragsakte als ZIP hinzugefuegt"
git push
```

Das Script erstellt vorher Backups und prüft `server.js` mit `node -c`.
Wenn ein Syntaxfehler entsteht, wird `server.js` automatisch zurückgesetzt.
