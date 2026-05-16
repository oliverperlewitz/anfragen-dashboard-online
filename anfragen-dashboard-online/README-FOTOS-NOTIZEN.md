# Foto-Uploads und interne Notizen

Dieses Update erweitert das Anfrage-Dashboard um Nachweis- und Dokumentationsfunktionen.

## Neu für Kunden

Kunden können beim Absenden einer Anfrage bis zu 5 Fotos vom Einsatzort hochladen.
Erlaubt sind:

- JPG
- PNG
- WEBP

Standard-Maximalgröße pro Bild: 5 MB.

## Neu im Admin-Dashboard

Pro Anfrage gibt es jetzt:

- Kundenfotos
- Vorher-Fotos
- Nachher-Fotos
- Interne Notizen

Interne Notizen sind nur im Dashboard sichtbar. Kunden erhalten diese Notizen nicht per E-Mail und sehen sie nicht auf der Website.

## Warum Vorher-/Nachher-Fotos?

Damit du später sauber dokumentieren kannst:

- wie der Auftrag vorher aussah
- welche Arbeiten durchgeführt wurden
- wie der Zustand nach Abschluss war

Das kann helfen, Missverständnisse oder Streitigkeiten mit Kunden zu vermeiden.

## Technischer Hinweis

Die Fotos werden in der Anfrage gespeichert. Wenn `DATABASE_URL` aktiv ist, landen sie in PostgreSQL innerhalb der Anfrage-Daten.

Für sehr viele oder sehr große Bilder wäre später ein externer Speicher wie S3, Cloudflare R2 oder ein ähnlicher Datei-Speicher besser.

## Dateien in diesem Update

Ersetzen:

- server.js
- package.json
- package-lock.json
- .env.example
- views/admin.ejs
- views/kontakt.ejs
- views/login.ejs
- views/users.ejs
- public/style.css

Nicht ersetzen:

- .env
- data
- node_modules
