# Allgemeine E-Mails im Dashboard

Dieses Update ergänzt einen Bereich **Allgemeine E-Mails** im Admin-Dashboard.

## Was passiert jetzt?

Wenn du im Dashboard auf **E-Mails abrufen** klickst, liest der Server dein STRATO-Postfach.

- E-Mails mit einer Auftragsnummer wie `#038900` werden wie bisher dem passenden Auftrag zugeordnet.
- E-Mails ohne passende Auftragsnummer landen im neuen Bereich **Allgemeine E-Mails**.

## Funktionen im Dashboard

Bei jeder allgemeinen E-Mail kannst du:

- **Neue Anfrage erstellen**
- **Einem bestehenden Auftrag zuordnen**
- **Als erledigt markieren**
- **Ignorieren / archivieren**

## Speicherung

Wenn `DATABASE_URL` gesetzt ist, werden allgemeine E-Mails in PostgreSQL in der Tabelle `general_emails` gespeichert.

Wenn keine Datenbank aktiv ist, werden sie lokal in `data/general-emails.json` gespeichert.

## Wichtig

Allgemeine E-Mails werden erst sichtbar, nachdem du im Dashboard auf **E-Mails abrufen** klickst.
