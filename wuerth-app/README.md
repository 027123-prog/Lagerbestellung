# Lagerbestellung mit Würth

Mobile Lagererfassung auf Grundlage der vorhandenen Lagerbestell-App. Die Startseite führt die bisherigen Lieferantengruppen weiter. `/wuerth` ergänzt artikelabhängige Erfassung, Packungsrechnung und die Vorbereitung einer IDS-Warenkorbübergabe.

## Bedienung

- `/`: bisherige Lagerbestellung mit Ist/Soll oder direkter Bestellmenge. Gruppen, Artikel und globaler Erfassungsmodus werden serverseitig gespeichert.
- `/wuerth`: je Artikel Bestand zählen, leer markieren oder einzelne Stück direkt eingeben. Kleinmaschinenlager und Büroreserve werden getrennt erfasst und gemeinsam verrechnet. Überschüsse können eine Umlagerung statt eines Einkaufs ergeben.
- Leer bedeutet genau eine hinterlegte VE. Fehlende Werte bleiben offen; eine ausdrücklich eingegebene Null bedeutet keine benötigte Menge.
- Der Vorschlag trennt kaufmännische Shop-Menge, volle Packungen und einzelne Blätter/Stücke. `contentsPerSalesUnit` und `purchaseMultipleSalesUnits` müssen zum konkreten Artikel passen.
- Eine Warenkorbübergabe ändert die gespeicherten Bestände nicht. Preise, Lieferbarkeit und Kaufabschluss werden anschließend im Würth-Shop geprüft.

## Lokal starten

Voraussetzungen: Node.js ab 22.13, npm, Git und für spätere Site-Pakete tar. In Codex die Programme des Workspace-Abhängigkeitsloaders verwenden. Zugangsdaten nie als Kommandozeilenargumente übergeben.

```powershell
npm run install:ci
npm run build
```

Auf einer frischen lokalen Datenbank die erste Migration genau einmal anwenden:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_wandering_bloodaxe.sql
```

Bereits angewandte Migrationen nicht erneut abspielen. Danach:

```powershell
npm run dev -- --port 5186
```

Die tatsächlich ausgegebene Local-URL öffnen; einen laufenden Server wiederverwenden. Loopback ist nur eine lokale Vorschau und kein vom Handy erreichbarer Produktionslink. Das portable Profil bietet auf Loopback eine Testanmeldung unter `/signin-with-chatgpt?return_to=/`. Diese Simulation gehört nicht zum Produktionsbuild; gehostete Anmeldung wird von Sites bereitgestellt.

Mit `npm start -- --port 5187` lässt sich der gebaute Worker lokal prüfen. Dafür muss der Build bereits vorliegen.

## Tests und Build

```powershell
node --test lib/core.test.mjs lib/ids.test.mjs
node ./node_modules/typescript/bin/tsc --noEmit
npm run build
```

Tests enthalten synthetische Artikel und Preise. Sie prüfen unter anderem Null gegenüber fehlend, manuelle Null, volle Sets/VE, Umlagerungen, Mehrmenge und Centkosten. IDS-Tests verwenden simulierte Antworten und belegen keine reale Würth-Warenkorbübergabe.

Die optionale XML-Prüfung benötigt die separat bereitgestellte originale ITEK-WKS-XSD 2.5 und einen Python-Interpreter mit `lxml`. Die Referenzdatei wird nicht automatisch heruntergeladen und ist kein erforderlicher Repository-Inhalt. Für diesen Zusatztest die absoluten Pfade in der aktuellen Shell setzen; in Codex dafür den Workspace-Runtime-Interpreter verwenden:

```powershell
$env:IDS_SCHEMA_PATH = '<absoluter Pfad zur ITEK-WKS-2.5-XSD>'
$env:PYTHON = '<absoluter Pfad zu Python mit lxml>'
node --test lib/ids.test.mjs
```

Ohne beide gültigen Pfade wird nur dieser optionale Test übersprungen; die portable Node-Testsuite bleibt ausführbar.

Prüfstand 06.11.2026: 27 Node-Tests bestanden, ein optionaler XSD-Test im Standardlauf übersprungen; separate Prüfung gegen die Original-XSD 2.5 mit neun von neun Fällen bestanden. 15 lokale HTTP-Guard-Fälle bestanden. Beide Oberflächen luden lokal; Speichern/Neuladen, dezimale Legacy-Menge, Artikeländerung/Soft-Deaktivierung sowie Leer- und Manuell-Packungsfälle wurden bei 390 × 844 Pixel geprüft. Teständerungen wurden zurückgesetzt. Ein echter Würth-Warenkorb und der abschließende Hosting-Build sind hiervon nicht abgedeckt.

Zusätzlich lokal prüfen: Anmeldung und gesperrte anonyme API-Zugriffe, Laden/Speichern nach Neuladen, beide alten Erfassungsarten, alle drei Würth-Modi, Artikeländerung/Deaktivierung, fehlende Angaben, kleine Handybreite und Fehleranzeigen. Server, zentrale API-Endpunkte und Speichern/Laden müssen vor einem Push lokal funktionieren.

## Datenbank und Migrationen

`db/schema.ts` ist die Schemaquelle, `drizzle/` enthält die versionierten SQL-Dateien und Drizzle-Metadaten. D1 ist als `DB` in `.openai/hosting.json` gebunden.

| Tabelle | Inhalt |
| --- | --- |
| `products` | Würth-Sortiment, Bestelleinheit, Modus, Sollwerte und optionaler gespeicherter Preisstand |
| `entries` | Aktuelle Würth-Erfassung als validiertes JSON je Benutzer und Artikel |
| `settings` | Initialisierungsmarker sowie alte Lagergruppen mit globalem Erfassungsmodus |

Alle Datensätze werden über `owner_id` getrennt. Artikeldeaktivierung ist eine Soft-Deaktivierung. Bei Schemaänderungen `npm run db:generate` ausführen, neue SQL-Dateien und Metadaten prüfen und versionieren. Migrationen enthalten nur Struktur, keine echten Artikel-, Preis-, Bestands- oder Zugangsdaten. Angewandte Migrationen bleiben unverändert. Lokale und gehostete D1-Datenbanken sind getrennt; die Site-Veröffentlichung wendet gehostete Migrationen an.

## Private Daten und Konfiguration

Lokal gehören Runtime-Werte ausschließlich in ignorierte `.dev.vars` bzw. `.env*`; gehostet werden sie über die Site-Umgebung gesetzt. Quellrepository und Veröffentlichungsarchiv dürfen weder diese Dateien noch Datenbankstände, echte Bestandslisten, Kundenpreise oder Passwörter enthalten.

| Variable | Zweck |
| --- | --- |
| `BOOTSTRAP_CATALOG_JSON` | Würth-Startsortiment als Array oder `{items:[...]}`; einmalig je Benutzer mit stabilen IDs eingelesen |
| `LEGACY_GROUPS_JSON` | Bisherige Gruppen als Array oder `{groups:[...],entryMode:...}`; gespeicherter Benutzerstand hat Vorrang |
| `WURTH_IDS_CUSTOMER_NUMBER` | Optionale Vorbelegung der Kundennummer im angemeldeten Verbindungsdialog |
| `WURTH_IDS_USERNAME` | Optionale Vorbelegung des IDS-Benutzers |

Es gibt keine Passwort-Umgebungsvariable. Das IDS-Passwort bleibt für die Sitzung im Browser-Arbeitsspeicher. Die Versionsprüfung reicht es kurzzeitig an die Serverroute und von dort an den festen Würth-Endpunkt weiter. Die WKS-Übergabe erfolgt als Browserformular direkt zu Würth. Das Passwort wird nicht in D1, Browser-Speicher oder Quellcode geschrieben und nach dem Übergabeversuch aus dem Dialogzustand entfernt.

Ohne Startdaten erscheinen leere Sortimente, keine Demo-Betriebsdaten. Änderungen der Bootstrap-Variablen überschreiben keinen bereits initialisierten Benutzerstand. Für eine Wiederherstellung werden neben Code und Migrationen separat gesicherte Betriebsdaten benötigt.

## Anmeldung und Nutzergrenze

Geschützte Seiten verwenden `requireChatGPTUser`, API-Routen `getChatGPTUser`. Unangemeldete API-Zugriffe werden abgewiesen. Schreibzugriffe verlangen eine passende Origin; IDs und Mengen werden serverseitig geprüft.

Die Daten gehören zum stabilen Site-Benutzer, nicht zur E-Mail-Adresse. Derselbe Benutzer kann sie auf Handy und PC öffnen. Ein anderer Login erhält einen getrennten Datenstand; dies ist noch keine gemeinsame Team-Lagerliste. Die private Site-Zugriffsgrenze bleibt beim Veröffentlichen erhalten.

## IDS-Ablauf und Grenzen

Der feste Einstiegspunkt in `lib/ids.mjs` wurde aus der Würth-IDS-Kontokonfiguration übernommen.

1. Einstellungen laden nur Vorbelegungen, niemals ein Passwort.
2. Verbindung prüfen sendet ausschließlich `action=SV`. Eine Versionsantwort belegt Erreichbarkeit, nicht eine bestätigte Anmeldung oder einen akzeptierten Warenkorb.
3. Im Vorschlag müssen vollständige Mengen und Bestelleinheiten bestätigt werden. Änderungen setzen die Bestätigung zurück.
4. Die Vorbereitung berechnet das XML erneut aus gespeicherten Artikeln und Erfassungen. Sie liefert `action=WKS`; Preise und Bestellauslösungskennzeichen werden nicht übertragen.
5. Der Browser ergänzt das eingegebene Passwort und wechselt zu Würth. Dort müssen Artikel, Mengen, Preise und Lieferbarkeit geprüft werden.

Unterstützte Versionen sind 2.0, 2.3 und 2.5, einschließlich passender Groß-/Kleinschreibung des Versionsparameters. XML-Mengen sind kaufmännische Shop-Mengen; aktuell wird `PCE` gesendet. Würths Annahme dieser Mengenabbildung und das Verhalten bei einem schon gefüllten Warenkorb müssen noch durch einen kontrollierten echten Test bestätigt werden. Die Anwendung behauptet keine bestätigten Zugangsdaten und keinen erfolgreich getesteten Warenkorb.

`/api/ids/return` liest keine fremden POST-Daten ein und speichert sie nicht. Rückgaben und automatische Bestandsbuchungen benötigen eine gesonderte Implementierung. Ein Kaufabschluss gehört nicht zur Bestellhilfe.

## Wichtige Dateien

- `public/legacy.html`, `app/page.tsx`: vorhandene Lagerbestellung als Startseite
- `app/wuerth/page.tsx`, `app/Bestellhilfe.tsx`: mobile Würth-Oberfläche
- `lib/core.mjs`: Mengenrechnung ohne Netzwerk
- `lib/store.ts`, `lib/validation.ts`, `app/api/`: Besitzprüfung, Speicherung und Validierung
- `lib/ids.mjs`, `lib/ids.test.mjs`: IDS-Vorbereitung und Protokolltests
- `db/schema.ts`, `drizzle/`: Datenbankstruktur und Wiederaufbau
- `.openai/hosting.json`, `worker/index.ts`: Site-Konfiguration und Worker

Die bestehende Oberfläche stammt aus `027123-prog/Lagerbestellung`. Die hiesige Quellfassung führt sie ohne eingebettete Betriebsdatensätze weiter; die Daten sind Runtime-Inhalt außerhalb des Quellcodes.
