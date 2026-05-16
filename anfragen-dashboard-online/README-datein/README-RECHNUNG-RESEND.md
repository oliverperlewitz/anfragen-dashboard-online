# Rechnung per Resend senden

Dieses Update ersetzt den Rechnungsversand über STRATO SMTP durch Resend.

Warum?

- Render Free blockiert ausgehende SMTP-Ports oft.
- Resend funktioniert bereits für deine Status-Mails.
- STRATO bleibt trotzdem für eingehende Kundenantworten zuständig.

## Dateien

Ersetzen:

- `public/invoice-lite.js`

Neu hinzufügen:

- `scripts/rechnung-resend-einbauen.js`
- `README-RECHNUNG-RESEND.md`

## Einbauen

Im Projektordner ausführen:

```bash
node scripts/rechnung-resend-einbauen.js
npm install
git add .
git commit -m "Rechnungen per Resend senden"
git push
```

Das Script entfernt den alten SMTP-Rechnungsblock und baut stattdessen einen Resend-Rechnungsversand ein.

## Render Environment

Diese Werte sollten vorhanden sein:

```env
RESEND_API_KEY=re_...
RESEND_FROM=GrünWerk Gartenbau <service@gruenwerk-gartenservice.de>
MAIL_FROM=GrünWerk Gartenbau <service@gruenwerk-gartenservice.de>
REPLY_TO_EMAIL=service@gruenwerk-gartenservice.de
```

Optional:

```env
INVOICE_PAYPAL_EMAIL=deine-paypal-email@example.com
```

STRATO SMTP Werte werden danach für Rechnungsmails nicht mehr benötigt.
