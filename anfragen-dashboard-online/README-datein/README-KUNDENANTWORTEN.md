# Kundenantworten im Dashboard

Dieses Update ergänzt eingehende Kundenantworten.

## Was passiert jetzt?

- Jede Kunden-E-Mail enthält die Anfragenummer im Betreff, z. B. `#911051`.
- Wenn ein Kunde auf eine E-Mail antwortet, kann Resend die Antwort per Webhook an die Website senden.
- Die Antwort wird automatisch dem passenden Auftrag zugeordnet.
- Bild-Anhänge aus der Kundenantwort werden als Kundenfotos beim Auftrag gespeichert.
- Die Antwort erscheint im Dashboard im Bereich **Kundenantworten**.

## Wichtige neue Route

```text
POST /webhooks/resend/inbound
```

Optional mit Token:

```text
https://deine-domain/webhooks/resend/inbound?token=DEIN_TOKEN
```

## Neue Environment Variables

```env
INBOUND_WEBHOOK_TOKEN=ein-langer-geheimer-webhook-token
REPLY_TO_EMAIL=
```

`INBOUND_WEBHOOK_TOKEN` ist empfohlen, damit nicht jeder beliebige Daten an deinen Webhook schicken kann.

`REPLY_TO_EMAIL` ist optional. Wenn es gesetzt ist, wird es als Antwortadresse für Kundenmails benutzt.

## Wichtig zu Resend Receiving

Damit echte Kundenantworten ins Dashboard kommen, muss in Resend Receiving/Webhook eingerichtet werden.
Wenn Resend Receiving nicht aktiv ist, landen Antworten weiterhin normal im Postfach, aber nicht automatisch im Dashboard.

## Hinweis

Diese Version speichert die Antwort und Fotos. Automatisches Erkennen und Ausfüllen einzelner Felder wie Adresse oder Termin kann später als nächster Schritt ergänzt werden.
