# Rechnung per STRATO SMTP senden

Dieses Update erweitert die vorhandene Rechnung-Lite-Funktion:

- PDF wird serverseitig erzeugt
- PDF wird in `data/invoices` gespeichert
- PDF wird automatisch per STRATO SMTP an den Kunden gesendet
- PDF kann danach im Dashboard heruntergeladen werden

## Dateien

Ersetzen:

- `public/invoice-lite.js`

Neu hinzufügen:

- `scripts/rechnung-smtp-einbauen.js`
- `README-RECHNUNG-SMTP.md`

## Einmal ausführen

```bash
node scripts/rechnung-smtp-einbauen.js
```

Danach:

```bash
npm install
git add .
git commit -m "Rechnung per STRATO SMTP senden"
git push
```

## Render Environment Variables

Für STRATO Versand brauchst du:

```env
SMTP_HOST=smtp.strato.de
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=service@gruenwerk-gartenservice.de
SMTP_PASS=DEIN_STRATO_POSTFACH_PASSWORT
SMTP_FROM=GrünWerk Gartenbau <service@gruenwerk-gartenservice.de>
```

Optional:

```env
INVOICE_PAYPAL_EMAIL=deine-paypal-email@example.com
INVOICE_COMPANY_ADDRESS=Deine Straße 1, 12345 Deine Stadt
INVOICE_IBAN=DE...
INVOICE_BIC=...
INVOICE_ACCOUNT_HOLDER=GrünWerk Gartenbau
INVOICE_BANK=Deine Bank
INVOICE_FOOTER=Vielen Dank für deinen Auftrag.
```

## Sicherheit

Das Script erstellt vorher Backups von:

- `server.js`
- `package.json`

Und prüft danach automatisch:

```bash
node --check server.js
```

Wenn ein Syntaxfehler entsteht, stellt das Script die Backups wieder her.
