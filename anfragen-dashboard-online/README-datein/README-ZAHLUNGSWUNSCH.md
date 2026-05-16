# Zahlungswunsch + PayPal

Dieses Update ergänzt:

- Kundenformular: „Wie möchtest du bezahlen?“
- Optionen: Rechnung/Überweisung, Bar vor Ort, PayPal, Kartenzahlung/Sonstiges, Noch offen
- Dashboard: Kundenwunsch Zahlung wird beim Auftrag angezeigt
- Rechnung-Lite: PayPal als Dokument-/Zahlungsart
- Rechnung-Lite: versucht automatisch die richtige Zahlungsart anhand des Kundenwunsches auszuwählen

## Dateien

Ersetzen:

- `public/invoice-lite.js`

Neu hinzufügen:

- `scripts/zahlungswunsch-einbauen.js`
- `README-ZAHLUNGSWUNSCH.md`

## Einbau

Im Projektordner ausführen:

```bash
node scripts/zahlungswunsch-einbauen.js
```

Dann:

```bash
git add .
git commit -m "Zahlungswunsch und PayPal hinzugefuegt"
git push
```

## Optional in Render Environment

Wenn du PayPal auf der Rechnung automatisch anzeigen willst:

```env
INVOICE_PAYPAL_EMAIL=deine-paypal-email@example.com
```

Danach Render neu deployen.
