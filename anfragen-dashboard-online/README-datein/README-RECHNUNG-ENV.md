# Rechnung-Lite: Bankdaten automatisch aus Render ENV laden

Dieses Update nutzt deine Render Environment Variables:

- INVOICE_COMPANY_ADDRESS
- INVOICE_IBAN
- INVOICE_BIC
- INVOICE_ACCOUNT_HOLDER
- INVOICE_BANK
- INVOICE_FOOTER

## Dateien ersetzen / hinzufügen

Ersetzen:
- public/invoice-lite.js

Neu hinzufügen:
- scripts/rechnung-env-einbauen.js

## Einmal ausführen

```bash
node scripts/rechnung-env-einbauen.js
```

Das Script ergänzt in server.js eine kleine sichere Route:

```text
GET /admin/invoice-settings
```

Die Route ist nur für eingeloggte Admins sichtbar und liefert die Bankdaten an das Dashboard.

## Hochladen

```bash
git add .
git commit -m "Rechnungsdaten automatisch aus Environment laden"
git push
```

Wichtig: Das Script prüft `server.js` mit `node -c`. Wenn ein Fehler entsteht, wird automatisch das Backup wiederhergestellt.
