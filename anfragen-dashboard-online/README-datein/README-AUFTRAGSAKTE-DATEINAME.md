# Auftragsakte-Dateiname mit Download-Datum

Dieses Update ändert den Namen der heruntergeladenen ZIP-Datei.

Vorher ungefähr:

```text
GW-2026-000017-Mila-Schoenefeld-Auftragsakte.zip
```

Nachher ungefähr:

```text
GW-2026-000017-Download-2026-05-17-Mila-Schoenefeld-Auftragsakte.zip
```

So sieht man später sofort, wann die ZIP-Datei heruntergeladen/erstellt wurde.

## Installation

Datei hinzufügen:

```text
scripts/auftragsakte-dateiname-datum-einbauen.js
```

Dann im Projektordner ausführen:

```bash
node scripts/auftragsakte-dateiname-datum-einbauen.js
```

Danach:

```bash
git add .
git commit -m "Auftragsakte Dateiname mit Download Datum"
git push
```

Das Script erstellt vorher automatisch ein Backup von `server.js` und prüft danach die Syntax.
