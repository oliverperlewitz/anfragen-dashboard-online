# Auftragsdaten bearbeiten und fehlende Infos automatisch ergänzen

Dieses Update ergänzt im Admin-Dashboard pro Auftrag den Bereich **Auftragsdaten bearbeiten**.

## Neu

- Admins können Name, E-Mail, Telefon, Leistung, Budget, Adresse, Auftragsart, Grundstücksgröße, Zeitraum, Besichtigung, Erreichbarkeit, Kontaktart und Details bearbeiten.
- Kundenantworten werden beim Abruf weiter dem Auftrag über die Auftragsnummer zugeordnet.
- Wenn der Kunde fehlende Infos klar schreibt, z. B. `Adresse: ...`, `Telefon: ...`, `Fläche: ...`, werden leere Felder automatisch ergänzt.
- Automatische Ergänzungen werden als interne Systemnotiz dokumentiert.

## Beispiel

Kunde antwortet:

```text
Adresse: Musterstraße 12, 12345 Berlin
Telefon: 0176 12345678
Fläche: ca. 80 qm
```

Wenn diese Felder im Auftrag noch leer waren, werden sie beim nächsten **E-Mails abrufen** automatisch gefüllt.
