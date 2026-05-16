# IMAP Login Fix

Dieses Update korrigiert die Erkennung der IMAP-Serverantworten.

Grund: Manche IMAP-Server senden die finale Antwort direkt mit dem Tag am Anfang der neuen Antwort. Die alte Prüfung erwartete immer einen Zeilenumbruch davor und konnte dadurch trotz erfolgreicher Antwort in einen Timeout laufen.

## Dateien ersetzen

- server.js

## Danach

```bash
git add .
git commit -m "IMAP Login Antworterkennung korrigiert"
git push
```

Optional kann bei Render gesetzt werden:

```env
IMAP_DEBUG=true
```

Dann schreibt der Server mehr IMAP-Logs, aber keine Passwörter.
