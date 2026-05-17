# Statusbereich untereinander erzwingen

Dieses Update verschiebt den unteren Auftragsbereich zuverlässig untereinander:

1. Status ändern & Kundeninfo schreiben
2. Gesendete Status-Infos anzeigen
3. Nachweis & Archiv
4. Löschen

Der Löschen-Bereich wird rot formatiert.

## Dateien hinzufügen

- public/status-stack-force.css
- public/status-stack-force.js
- scripts/status-stack-force-einbauen.js

## Danach ausführen

node scripts/status-stack-force-einbauen.js

## Danach pushen

git add .
git commit -m "Statusbereich untereinander repariert"
git push
