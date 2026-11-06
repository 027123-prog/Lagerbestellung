# Würth-Einstieg auf GitHub Pages

Die vorhandene `lagerbestellung.html` enthält auf der Startseite eine feste Würth-Kachel über den Lagergruppen. Sie bleibt auch bei leerem oder neu geladenem Gruppenbestand sichtbar.

Die Kachel öffnet den geschützten Würth-Bereich der Bestellhilfe. GitHub Pages stellt den öffentlichen Einstieg bereit; die eigentliche Erfassung und Datenhaltung bleiben in der privaten App. Beim ersten Öffnen ist die Anmeldung mit dem berechtigten ChatGPT-Konto erforderlich.

Die bisherigen Lagergruppen, Excel-Funktionen und Erfassungsmodi bleiben erhalten. Diese Ergänzung überträgt keine Bestände oder Zugangsdaten. Der Link öffnet nur den privaten Würth-Bereich und löst keine Bestellung aus.

Wichtige Stellen: `.wuerth-entry` im Stylesheet und der feste Anker innerhalb von `#homeView`. Öffentliche Adresse: https://027123-prog.github.io/Lagerbestellung/lagerbestellung.html

Lokal geprüft: Startansicht, Handybreite, unveränderter Aufruf der Lagergruppe und korrektes Ziel des Würth-Links. Nach Veröffentlichung wird die GitHub-Pages-Version sichtbar geprüft.
