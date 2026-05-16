# Kalender und freie Termine

Dieses Update fügt einen großen Kalender im Admin-Dashboard hinzu.

## Funktionen

- Admins sehen einen Kalender mit freien und belegten Uhrzeiten.
- Nicht eingeplante Aufträge können per Drag & Drop auf freie Slots gezogen werden.
- Pro Auftrag kann Datum, Uhrzeit, Kalenderstatus und eine interne Kalendernotiz gespeichert werden.
- Kunden können im öffentlichen Formular einen freien Wunschtermin auswählen.
- Belegte Termine werden im Formular automatisch ausgeblendet.
- Kunden-Wunschtermine erscheinen im Dashboard orange als „Möglicher Auftrag“.
- Bestätigte Admin-Termine erscheinen grün.

## Farben

- Orange: Möglicher Auftrag aus Kundenformular
- Grün: Termin bestätigt
- Blau: In Arbeit
- Grau: Erledigt

## Optionale Environment Variables

```env
CALENDAR_SLOT_TIMES=08:00,09:00,10:00,11:00,12:00,13:00,14:00,15:00,16:00,17:00
CALENDAR_DAYS_AHEAD=21
```

Wenn diese Werte nicht gesetzt sind, nutzt der Server automatisch die Standardwerte.
