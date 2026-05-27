# Projekt: Lagerbestell App

## Stand 2026-05-19

### Was gemacht wurde

- Lokale Suche nach `lagerbestellung.html` im Benutzerprofil.
- Gefundenen Projektstand aus `C:\Users\Nils Wienstroer\Documents\Codex Test 2\LagerBestellApp` in diesen Projektordner kopiert.
- Kopiert wurden die HTML-Datei, Flask-Dateien, Vorlagen, Datenordner, statische Dateien und Templates.

### Ausloeser

Nils wollte alles, was zur Lagerbestell App auffindbar ist, in den Projektordner holen. Suchbegriff war `lagerbestellung.html`; die Dateien sollten kopiert werden.

### Wichtige Entscheidungen

- Es wurde nur lokal gesucht, keine Server- oder UNC-Pfade.
- Der gefundene Ordner wurde vollstaendig kopiert, damit der vorhandene Arbeitsstand hier erhalten bleibt.
- Die vorhandene README beschreibt die HTML-Loesung als Hauptvariante und die Flask-Dateien als optionale alte Server-Variante.

### Relevante Dateien

- `lagerbestellung.html`: eigenstaendige HTML-Loesung fuer Lagerbestellungen mit Excel-Import/-Export.
- `README.md`: Start- und Funktionsbeschreibung.
- `app.py`: alte optionale Flask-Variante.
- `templates/` und `static/`: Dateien fuer die Flask-Variante.
- `data/`: Beispieldaten.
- `lagerbestand_vorlage_*.xlsx`: Excel-Vorlagen.

### Naheliegende naechste Schritte

- Entscheiden, ob die HTML-Datei allein weiterentwickelt wird oder die Flask-Variante wieder relevant ist.
- Kurz lokal oeffnen/testen, ob Excel-Laden, Eingabe und Export wie gewuenscht funktionieren.
- Falls das Projekt in GitHub soll: Repository initialisieren, sensible Daten pruefen und README/Doku aktuell halten.

## Stand 2026-05-20

### Was gemacht wurde

- In `lagerbestellung.html` wurde oben ein Modus-Schieberegler ergaenzt.
- Linke Stellung: `Bestellmenge erfassen`.
- Rechte Stellung: `Bestand erfassen`.
- Die Farbgebung der Seite wechselt je nach Modus.

### Ausloeser

Nils wollte zwischen direkter Bestellmengenerfassung und Bestandserfassung umschalten koennen. Der aktive Modus soll sofort sichtbar sein und die Seite farblich unterscheidbar machen.

### Wichtige Entscheidungen

- Der Schalter sitzt global oben ueber der App, damit er sowohl in der Gruppenuebersicht als auch in der Artikelerfassung praesent ist.
- Im Bestellmodus werden Eingaben als direkte Bestellmenge gespeichert und fuer Mail/Export genutzt.
- Im Bestandsmodus werden Eingaben als Ist-Bestand gespeichert; Bestellmengen werden daraus wie bisher aus Soll minus Ist berechnet.

### Relevante Dateien

- `lagerbestellung.html`: Modus-Schalter, Farbschemata und Erfassungslogik.

## Stand 2026-05-27

### Was gemacht wurde

- Die eingebauten Startdaten in `lagerbestellung.html` wurden aus der aktualisierten Excel `lagerbestand_vorlage_mass_schoen.xlsx` uebernommen.
- Besonders die Gruppe `Moebelbauplatten` enthaelt jetzt die aktualisierten Artikel und Wunsch-Sollbestaende aus der Excel.
- Nach einer weiteren Excel-Aktualisierung wurden die Sollbestaende erneut in die HTML-Startdaten uebernommen.
- Die Eingabefelder akzeptieren jetzt Dezimalzahlen mit Komma oder Punkt, z. B. `0,5` und `0.5`.
- In der Artikelerfassung wurde ein Button `LEEREN` ergaenzt, der die Felder des aktuellen Modus leert.

### Ausloeser

Nils hatte die Excel mit den Wunsch-Lagerbestaenden aktualisiert und wollte die Page entsprechend aktualisieren.

### Wichtige Entscheidungen

- Die HTML-Seite wurde direkt aktualisiert, damit die Daten beim Oeffnen sofort sichtbar sind und nicht erst manuell per Excel-Import geladen werden muessen.
- Die Lieferantenmail-Felder wurden so uebernommen, wie sie in der Excel stehen; aktuell sind sie leer.
- Fuer GitHub Pages wurde `index.html` als Weiterleitung auf `lagerbestellung.html` ergaenzt, damit die Projekt-Domain direkt die App oeffnet.
- Fuer Dezimal-Komma wurden die Artikel-Eingabefelder von `number` auf `text` mit Dezimal-Tastatur umgestellt; die vorhandene Parser-Logik wandelt Komma und Punkt in Zahlen.
