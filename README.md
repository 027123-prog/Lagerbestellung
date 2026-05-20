# LagerBestellApp

Reine HTML-Loesung fuer Lagergruppen mit Excel als Datenbasis.

## Start (ohne App/Server)

1. Datei `lagerbestellung.html` per Doppelklick im Browser oeffnen.
2. Entweder:
- `Demo laden` klicken (Sperrholz-Beispiel), oder
- eigene Excel-Datei laden.

Kantige UI-Version:

- reduzierte Kachelansicht mit sehr wenig Text
- Eingabefeld leert den vorbefuellten Wert beim ersten Antippen
- Export erzeugt eine formatierte Excel mit klaren Linien/Flaechen

## Was die HTML-Datei kann

- Excel mit mehreren Mappen laden (jede Mappe = eine Lagergruppe)
- Kacheluebersicht der Lagergruppen
- Mobile Eingabe des aktuellen Bestands
- Bestellmail per `mailto:` an Lieferantenmail aus `B1`
- Aktualisierte Excel wieder herunterladen

## Erwarteter Excel-Aufbau pro Mappe

- `A1`: `LieferantenEmail`
- `B1`: E-Mail-Adresse des Lieferanten
- `A3:E3`: `Artikel | Mass | Sollbestand | AktuellerBestand | Einheit`
- Ab Zeile 4: Artikeldaten

## Enthaltenes Startbeispiel

Die Datei ist auf dein Sperrholz-Beispiel vorbereitet:

- `Sperrholz`: Pappel + Bausperrholz untereinander in einer Mappe
- `Moebelbauplatten`: eigene neue Mappe
- Sollbestand jeweils `2 Stk`
- `Ist` ist leer und wird bei leerem Feld ignoriert

Zusatzdatei:

- `lagerbestand_vorlage_schoen_neu.xlsx` (fruehere formatierte Vorlage)
- `data/lagerbestand_neu.xlsx` (fruehere Datenversion)
- `lagerbestand_vorlage_mass_schoen.xlsx` (aktuelle formatierte Vorlage mit `Mass`-Spalte)
- `data/lagerbestand_mass.xlsx` (aktuelle Datenversion mit `Mass`-Spalte)

## Optional: alte Flask-Variante

Die bisherigen Dateien `app.py`, `templates/`, `static/` sind noch vorhanden, falls du spaeter wieder eine Server-Variante willst.
