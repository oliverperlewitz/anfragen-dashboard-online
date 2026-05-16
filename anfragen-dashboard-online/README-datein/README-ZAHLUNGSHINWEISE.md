# Zahlungshinweise für Rechnungen

Dieses Update ergänzt in der Rechnung automatisch passende Zahlungshinweise je nach Zahlungsart.

## Ersetzen

- `public/invoice-lite.js`

## Wirkung

- Rechnung / Überweisung: Zahlungsziel 14 Tage, zahlbar bis Datum, Verwendungszweck
- PayPal: Zahlungsziel 14 Tage, zahlbar bis Datum, PayPal-Adresse
- Barzahlung / Quittung: Betrag dankend bar erhalten, Status bezahlt
- Kartenzahlung / Sonstiges: Zahlung erhalten oder gesondert vereinbart
