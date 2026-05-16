# Auftragsakte Button reparieren

Dieses Script fügt den Button **Auftragsakte herunterladen** sichtbar in die geöffnete Auftragskarte ein.

## Ausführen

```bash
node scripts/auftragsakte-button-reparieren.js
```

Danach:

```bash
git add .
git commit -m "Auftragsakte Button repariert"
git push
```

Falls das Script sagt, dass die Route fehlt, zuerst ausführen:

```bash
node scripts/auftragsakte-einbauen.js
```
