# IMAPFlow Fix für STRATO-Kundenantworten

Dieses Update ersetzt den einfachen selbstgebauten IMAP-Login durch die robuste Bibliothek `imapflow`.

## Dateien ersetzen

- `server.js`
- `package.json`
- `.env.example` optional

## Danach lokal/online installieren

Da ein neues Paket dazukommt, danach ausführen:

```bash
npm install
git add .
git commit -m "STRATO IMAP Abruf mit ImapFlow stabilisiert"
git push
```

## Render Environment

Diese Variablen bleiben wichtig:

```env
IMAP_HOST=imap.strato.de
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=webmaster@gruenwerk-gartenservice.de
IMAP_PASS=DEIN_STRATO_POSTFACH_PASSWORT
IMAP_FETCH_LIMIT=30
IMAP_TIMEOUT_MS=60000
```

Im Render-Log sollten beim Abruf Einträge erscheinen wie:

```text
[IMAP] Verbindung wird aufgebaut
[IMAP] Login erfolgreich
[IMAP] Posteingang gelesen
[IMAP] Abruf fertig
```
