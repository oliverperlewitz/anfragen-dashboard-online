# PostgreSQL für GrünWerk

Diese Version kann Anfragen dauerhaft in PostgreSQL speichern.

## Was wurde geändert?

- Wenn `DATABASE_URL` gesetzt ist, werden Anfragen in PostgreSQL gespeichert.
- Wenn `DATABASE_URL` nicht gesetzt ist, funktioniert die Website lokal weiter mit `data/anfragen.json`.
- Beim ersten Start mit leerer Datenbank werden vorhandene lokale Anfragen aus `data/anfragen.json` automatisch in PostgreSQL migriert, falls die Datei vorhanden ist.
- Backups im Admin-Dashboard werden weiterhin als JSON-Dateien erzeugt. Auf Render Free sind diese Backup-Dateien nicht dauerhaft garantiert; die wichtigen Anfragen liegen aber dauerhaft in PostgreSQL.

## Render Environment

Im Webservice `anfragen-dashboard-online` muss diese Variable gesetzt sein:

```env
DATABASE_URL=<Internal Database URL von gruenwerk-db>
```

Nimm die **Internal Database URL**, nicht die External Database URL.

## Nach dem Einspielen

Lokal einmal ausführen:

```bash
npm install
npm start
```

Dann online bringen:

```bash
git add .
git commit -m "PostgreSQL fuer Anfragen hinzugefuegt"
git push
```

Render startet danach neu. In den Logs sollte stehen:

```text
[DB] Speicher: PostgreSQL
```

Wenn dort steht:

```text
[DB] Speicher: JSON-Datei
```

fehlt bei Render noch `DATABASE_URL`.
