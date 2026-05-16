# GrünWerk Rechnung / Barzahlung PDF

Dieses Update baut einen Bereich **Zahlung & Rechnung** in jede Anfrage ein.

## Funktionen

- Zahlungsart auswählen: Rechnung / Überweisung, Barzahlung, Kartenzahlung/Sonstiges
- Steuer auswählen: Kleinunternehmer § 19 UStG oder Umsatzsteuer 19 %
- Rechnungspositionen eintragen
- PDF-Rechnung oder Barrechnung/Quittung erstellen
- PDF öffnen/herunterladen
- Rechnung als bezahlt markieren
- Barzahlung wird automatisch als bezahlt gespeichert

## Design der PDF

- oben links GrünWerk Logo/Name
- oben rechts Rechnungsnummer + Datum
- grüne Akzentlinie
- Kundendaten sauber darunter
- Leistungspositionen als Tabelle
- Gesamtbetrag groß hervorgehoben
- unten Zahlungsdaten + rechtlicher Hinweis

## Einbau

1. ZIP entpacken.
2. Neue Datei in dein Projekt kopieren:

```text
scripts/rechnung-einbauen.js
```

3. Im Projektordner ausführen:

```bash
node scripts/rechnung-einbauen.js
npm install
```

4. Danach hochladen:

```bash
git add .
git commit -m "Rechnung und Barzahlung als PDF hinzugefuegt"
git push
```

## Optionale Render Environment Variables

```env
INVOICE_COMPANY_ADDRESS=Deine Straße 1, 12345 Deine Stadt
INVOICE_IBAN=DE...
INVOICE_FOOTER=Vielen Dank für deinen Auftrag.
```

Wichtig: Wenn du nicht Kleinunternehmer bist, kläre die Steuerangaben mit Steuerberater/Finanzamt.
