# Rechnungs-Zahlungsdaten nach Zahlungsart

Dieses Update ändert die Anzeige der Zahlungsdaten in der Rechnung/PDF:

- Rechnung / Überweisung: Bankdaten + Verwendungszweck + Zahlbar-bis-Hinweis
- PayPal: nur PayPal-Adresse + Zahlbar-bis-Hinweis
- Barzahlung / Quittung: keine Bankdaten, sondern „Betrag dankend bar erhalten“
- Kartenzahlung / Sonstiges: keine Bankdaten, sondern Zahlungsnachweis/Hinweis

## Ersetzen

- `public/invoice-lite.js`

## Nicht ersetzen

- `server.js`
- `views/admin.ejs`
- `public/style.css`
- `.env`
- `data`
