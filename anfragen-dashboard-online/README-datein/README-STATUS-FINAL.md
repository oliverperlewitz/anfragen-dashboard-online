# Statusbereich untereinander final

Dieses Update erzwingt den unteren Auftragsbereich als saubere Liste untereinander:

1. Status ändern & Kundeninfo schreiben
2. Gesendete Status-Infos anzeigen
3. Nachweis & Archiv
4. Löschen

Alle Boxen werden gleich breit. Der Löschen-Bereich ist rot.

## Ersetzen
- `public/status-actions.css`
- `public/status-templates.js`

## Nicht ersetzen
- `server.js`
- `views/admin.ejs`
- `public/style.css`
- `.env`

Wenn die Dateien noch nicht eingebunden sind, einmal das alte Einbau-Script ausführen:

```bash
node scripts/status-layout-vorlagen-einbauen.js
```
