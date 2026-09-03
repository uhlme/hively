# Hively Store Launch & Handover Plan

## Zweck

Dieses Dokument dient als Übergabe- und Arbeitsplan für den realen App-Store- und Play-Store-Launch von Hively. Es bündelt die bereits vorbereiteten technischen Schritte, die offenen Store-Aktionen und die Reihenfolge der Umsetzung.

## Statusübersicht

### Bereits umgesetzt
- ASO-/Store-Marketing-Analyse und Plan erstellt
- Fastlane-Workflow für Metadaten und Screenshots vorbereitet
- Screenshot-Overlay-Textvorlagen ergänzt
- GitHub Actions-Workflow für Store-Uploads vorbereitet
- UI-Test-/Seed-Mechanismus für deterministische Screenshots ergänzt
- Demo-Daten-Seed für Screenshot- und QA-Szenarien eingebaut
- Validierung durchgeführt: Tests und Build erfolgreich

### Noch extern / manuell
- App Store Connect Setup
- Play Console Setup
- Spracheinstellungen freischalten
- Business-/Content-Rating-/Pricing-Checks
- tatsächlicher Upload mit echten Store-Anmeldedaten

---

## Projektziel

Hively soll in den App Stores mit konsistenter Positionierung, lokalisierter Store-Optimierung und professioneller Screenshot-Pipeline veröffentlicht werden. Dabei ist der technische Teil in der Repo-Struktur bereits vorbereitet; die verbleibenden Schritte sind überwiegend Store- und Account-seitig.

---

## Verantwortungsbereiche

### 1. Repo / technische Umsetzung
- Fastlane-Konfiguration
- GitHub Actions
- Screenshot-Pipeline
- Metadata-Textdateien
- App-UI-Seed für Screenshots

### 2. Store-Account / Konsole
- App Store Connect App anlegen
- Play Console App anlegen
- Preise / Länder / Verfügbarkeit
- Content Rating
- Business Settings
- Release Review und Freigabe

### 3. Marketing / Inhalt
- Store-Listing-Texte
- Screenshot-Text-Overlay
- Release Notes
- Promo Texte je Saison
- UTM-Links und CTA-Kampagnen

---

## Vorgehensweise

### Phase 1: Store-Setup

#### App Store Connect
- [ ] App anlegen
- [ ] Bundle ID prüfen
- [ ] App-Name und Kategorie validieren
- [ ] Preis und Ländernetzwerk bestätigen
- [ ] App Datenschutz / Datenschutzhinweise ergänzen
- [ ] Inhaltsbewertung finalisieren
- [ ] Sprachpakete freischalten: de-DE, fr-FR, it, en-US
- [ ] Build/Version hochladen
- [ ] Release-Notes prüfen

#### Google Play Console
- [ ] App anlegen
- [ ] Paketnamen / App-ID bestätigen
- [ ] Store-Listing für alle relevanten Sprachen prüfen
- [ ] Inhaltseinstufung / Datenschutz / App-Details validieren
- [ ] Feature Graphic und Screenshot-Assets vorbereiten
- [ ] Release-Notes für Android definieren
- [ ] Freigabeprozess für Produktion vorbereiten

### Phase 2: Technische Vorbereitung im Repo

#### GitHub Actions / CI
- [ ] Workflow für App Store / Play Store Metadaten prüfen
- [ ] Secrets und Credentials im Repository hinterlegen
- [ ] Build- und Upload-Job für macOS/Test-Umgebung validieren
- [ ] Screenshot-Job optional aktivieren, wenn echte Assets bereitstehen

#### Fastlane
- [ ] iOS Metadata Upload validieren
- [ ] Android Metadata Upload validieren
- [ ] Screenshot-Funktion mit Frameit prüfen
- [ ] Changelog-Handling und Locale-Handling verifizieren

### Phase 3: Screenshot-Generierung

- [ ] Bildschirm-Seed für Screenshot-Szenarien aktiv
- [ ] iOS-UI-Test für 5 Kernansichten laufen lassen
- [ ] Framed Screenshots erstellen
- [ ] Bildqualität und Textüberlagerungen prüfen
- [ ] Alle benötigten Store-Bilder exportieren

### Phase 4: Release und Upload

- [ ] Metadata in App Store Connect hochladen
- [ ] Metadata in Play Console hochladen
- [ ] Screenshots in beide Stores hochladen
- [ ] Finales Review und Korrekturen durchführen
- [ ] Release auf Produktion freigeben

---

## Relevante Dateien

- [.github/workflows/store-metadata.yml](../../.github/workflows/store-metadata.yml)
- [fastlane/Fastfile](../../fastlane/Fastfile)
- [fastlane/screenshots/README.md](../../fastlane/screenshots/README.md)
- [fastlane/screenshots/Framefile.json](../../fastlane/screenshots/Framefile.json)
- [docs/marketing/store-marketing-plan.md](./store-marketing-plan.md)
- [src/devSeed.js](../../src/devSeed.js)
- [ios/App/App/MainViewController.swift](../../ios/App/App/MainViewController.swift)
- [ios/App/AppUITests/AppUITests.swift](../../ios/App/AppUITests/AppUITests.swift)

---

## Release-Checkliste

### Inhalte
- [ ] Titel und Subtitle geprüft
- [ ] Beschreibung und Keywords aktualisiert
- [ ] Promo Text saisonal passend
- [ ] Release Notes fertig
- [ ] Screenshots für alle relevanten Sprachen vorbereitet

### Store-Settings
- [ ] Preise und Verfügbarkeit geprüft
- [ ] Content Rating bestätigt
- [ ] Geschäftsversion / Business Settings validiert
- [ ] Datenschutz-/Rechtstexte verlinkt

### Technische Validierung
- [ ] Tests grün
- [ ] Build grün
- [ ] Workflow syntax valid
- [ ] Screenshot-Job erfolgreich

### Abschluss
- [ ] Store-Review abgeschlossen
- [ ] Veröffentlichung genehmigt
- [ ] App live im Store

---

## Risiken und Gegenmaßnahmen

### Risiko: Store-Sprachen sind noch nicht freigeschaltet
Gegenmaßnahme: Sprachfreigabe in App Store Connect vor dem Upload sicherstellen.

### Risiko: Screenshots sind leer oder nicht repräsentativ
Gegenmaßnahme: UI-Seed und App UITest vor Screenshots aktivieren und die Screens vor Upload prüfen.

### Risiko: GitHub Actions läuft nicht mit echten Store-Credentials
Gegenmaßnahme: notwendige Secrets und App-Store-Uploads gezielt hinterlegen und Fire-and-Forget nicht verwenden.

### Risiko: Store-Listing-Texte sind nicht lokalisiert
Gegenmaßnahme: Locale-Ordner und UI-Strings separat prüfen; keine unvollständigen Übersetzungen freigeben.

---

## Prioritäten

### P0 – Sofort
- Store-Konsolen aktivieren
- Sprachen freischalten
- App-Infos validieren
- Build/Version vorbereiten

### P1 – Vor Veröffentlichung
- Screenshots erstellen
- Metadata uploaden
- Play Store / App Store Review

### P2 – Nach Launch
- Store-Performance beobachten
- Ranking/Conversion prüfen
- Nutzungsdaten / CTA-Tracking auswerten

---

## Empfehlung

Die technische Grundlage ist bereits im Repository vorhanden und validiert. Der eigentliche Launch-Blocker ist jetzt nicht mehr die App selbst, sondern die erfolgreiche, manuelle Freigabe und Validierung in den jeweiligen Store-Konsolen. Deshalb sollte die Umsetzung in dieser Reihenfolge erfolgen:

1. Store-Setup abschließen
2. Sprachen und App-Infos validieren
3. Screenshot-Upload und Metadata-Upload ausführen
4. Review und Freigabe
5. Launch + Nachverfolgung

---

## Abschlussnote

Der Store-Launch ist technisch vorbereitet, aber nicht vollständig automatisierbar, weil die App Store Connect- und Play Console-Aktionen weiterhin Account- und Konsole-seitig erfolgen müssen. Sobald diese Schritte abgeschlossen sind, kann der bestehende CI-/Fastlane-Workflow mit minimaler zusätzlicher Abstimmung sofort für den realen Upload verwendet werden.
