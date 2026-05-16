# Statusbereich symmetrisch + Vorlagen

Dieses Update macht den unteren Bereich in der Auftragskarte übersichtlicher und ergänzt Status-Vorlagen.

## Dateien hinzufügen

- public/status-actions.css
- public/status-templates.js
- scripts/status-layout-vorlagen-einbauen.js

## Danach ausführen

```bash
node scripts/status-layout-vorlagen-einbauen.js
```

Danach:

```bash
git add .
git commit -m "Statusbereich formatiert und Vorlagen hinzugefuegt"
git push
```

## Was wird geändert?

- Der untere Aktionsbereich wird symmetrischer formatiert.
- Status ändern & Kundeninfo bekommt mehr Platz.
- Für jeden Status gibt es mindestens eine Vorlage.
- Die Vorlage kann ausgewählt werden und füllt die Nachricht an den Kunden.

## Nicht betroffen

- server.js
- Datenbank
- Rechnungen
- E-Mail-Abruf
- Login
