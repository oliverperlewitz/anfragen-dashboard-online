# STRATO-Kundenantworten im Dashboard abrufen

Dieses Update liest Kundenantworten aus dem STRATO-Webmail-Postfach und importiert sie ins Admin-Dashboard.

## Warum

Resend Free erlaubt nur eine Domain. Damit `service@gruenwerk-gartenservice.de` weiter normal in STRATO Webmail empfangen kann, holen wir Kundenantworten direkt aus dem STRATO-Postfach per IMAP ab.

## Neue Environment Variables bei Render

Im Render Webservice unter **Environment** ergänzen:

```env
IMAP_HOST=imap.strato.de
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=webmaster@gruenwerk-gartenservice.de
IMAP_PASS=DEIN_STRATO_POSTFACH_PASSWORT
IMAP_FETCH_LIMIT=30
```

`IMAP_PASS` ist das Passwort vom STRATO-Postfach, nicht dein STRATO-Kundenlogin.

## Nutzung im Dashboard

Im Admin-Dashboard gibt es oben einen neuen Bereich:

**Kundenantworten aus STRATO abrufen**

Mit dem Button **E-Mails abrufen** prüft der Server die letzten E-Mails im STRATO-Postfach.

## Zuordnung zum Auftrag

Die Antwort wird automatisch zugeordnet, wenn im Betreff eine Anfragenummer steht, zum Beispiel:

```text
#038900
```

Die Kundenmails enthalten diese Nummer bereits im Betreff.

## Duplikate

Bereits importierte E-Mails werden über die Message-ID erkannt und nicht doppelt gespeichert.

## Anhänge

Bild-Anhänge in JPG, PNG oder WEBP werden als Kundenfotos beim Auftrag gespeichert.
