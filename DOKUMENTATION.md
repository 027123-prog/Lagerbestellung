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
