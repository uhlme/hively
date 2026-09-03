# Store-Marketing-Plan (App Store + Play Store)

Umsetzbarer ASO- und Store-Marketingplan für Hively, aufbauend auf der
bestehenden Fastlane-Infrastruktur. Ergänzt das Offline-Marketing (Flyer, UTM,
PostHog) aus [`README.md`](./README.md).

> **Kernbotschaft:** Stockbuch am Bienenstand — offline, ohne Login. Cloud, Team
> und KI optional mit Hively Pro.

## Zielgruppe & Positionierung

- **Primär:** Hobby- und Nebenerwerbsimker in der Schweiz.
- **Sekundär:** DACH über de/fr/it/en-Listings.
- **Differenzierung:** bienenstand-spezifisch (Völker, Varroa, Honig,
  Saisonkalender), lokal-first/offline, Schweizerdeutsch-KI (nur Pro).
- **Regeln:** Kernfunktionen ohne Abo; Pro/KI/Login/Internet immer explizit;
  keine erfundenen Rankings oder «kostenlos»-Versprechen ohne Kontext
  (siehe `.cursor/rules/store-metadata.mdc`).

## Dateien & Zuständigkeit

| Bereich | Ort |
| ------- | --- |
| iOS-Listing-Texte | [`fastlane/metadata/{locale}/`](../../fastlane/metadata/) |
| Android-Listing-Texte | [`fastlane/metadata/android/{locale}/`](../../fastlane/metadata/android/) |
| Screenshots + frameit | [`fastlane/screenshots/`](../../fastlane/screenshots/) |
| Upload-Lanes | [`fastlane/Fastfile`](../../fastlane/Fastfile) |
| CI-Workflow | [`.github/workflows/store-metadata.yml`](../../.github/workflows/store-metadata.yml) |
| Screenshot-Overlay-Texte | [`aso-screenshot-texts.md`](./aso-screenshot-texts.md) |
| Store-Badges/Links | [`public/start/index.html`](../../public/start/index.html) |

## ASO-Strategie

### Keyword-Cluster (de-DE Priorität)

| Cluster | Keywords | Platzierung |
| ------- | -------- | ----------- |
| Kern | Imkerei, Bienen, Bienenstand, Bienenvolk, Imker | `keywords.txt`, Titel/Untertitel |
| Funktion | Kontrolle, Varroa, Honig, Stockkarte, Behandlung | Beschreibung, Screenshots |
| Nutzen | offline, Stockbuch, Saisonkalender | Subtitle, Short Description |
| Long-tail | Bienen Radar, Bienenpatenschaft, Team Imkerei | Full Description |

- **iOS** `keywords.txt`: max. 100 Zeichen, kommagetrennt, keine Wörter aus
  Titel/Subtitle wiederholen. Aktuell 93 Zeichen.
- **Android** hat kein Keyword-Feld → Keywords in `title.txt`,
  `short_description.txt` und den ersten 250 Zeichen von `full_description.txt`.

### Text-Limits pro Feld

| Feld | iOS | Android | Ziel |
| ---- | --- | ------- | ---- |
| Name/Titel | 30 | 30 | Marke + Nutzen |
| Subtitle / Short | 30 | 80 | Stärkster Nutzen zuerst |
| Promo | 170 | — | Saisonaler Hook |
| Description | 4000 | 4000 | Bullet-Struktur, CTA am Ende |
| Release Notes | 4000 | 500 | Pro Release anpassen |

### Saisonaler Promo-Kalender (`promotional_text.txt`, iOS)

Änderbar ohne App-Release: Text ändern → `fastlane ios upload_metadata`.

| Monat | Promo-Hook (de) |
| ----- | --------------- |
| Feb–Apr | Frühjahrsinspektion — Checklisten bereit |
| Mai–Jun | Schwarmzeit — Völker im Blick |
| Jul–Aug | Honigernte dokumentieren |
| Sep–Nov | Varroa-Behandlung protokollieren |
| Dez–Jan | Saisonplanung & Finanzen |

## Screenshots (frameit-Pipeline)

### iOS (macOS)

Ablauf und benötigte Assets: [`fastlane/screenshots/README.md`](../../fastlane/screenshots/README.md).

```
ios screenshots  →  ios frame_shots  →  SKIP_SCREENSHOTS=false ios upload_metadata
```

### Android (Linux-Emulator / CI)

Gleiche 5 Screens über Instrumentation-Test + Emulator — **kein Mac nötig**.

```
android screenshots  →  android frame_shots  →  SKIP_STORE_SCREENSHOTS=false android upload_metadata
```

CI: Workflow **Store metadata** mit Screenshot-Modus `upload_existing` oder
`generate_and_upload` und Platform `android` oder `both`
(`reactivecircus/android-emulator-runner` nur bei Generate).

Screenshot-Set (5 iPhone, 3 iPad optional, 5 Android) und Overlay-Texte:
[`aso-screenshot-texts.md`](./aso-screenshot-texts.md). Rohaufnahmen sind
gitignored; finale, gerahmte `*_framed.png` können committet werden. Play-Store-
Kopien landen unter `fastlane/metadata/android/de-DE/images/phoneScreenshots/`.

Der UI-Test in
[`ios/App/AppUITests/AppUITests.swift`](../../ios/App/AppUITests/AppUITests.swift)
nimmt 5 Screens auf (Dashboard, Völker, Finanzen, Kalender, Einstellungen) und
startet die App pro Screen mit `-hively-uitest-view <name>` neu — die View wird
direkt über `?view=` geöffnet statt per WebView-Tap. Deterministische Demo-Daten
kommen über `-hively-uitest-seed`
([`ios/App/App/MainViewController.swift`](../../ios/App/App/MainViewController.swift)
→ [`src/devSeed.js`](../../src/devSeed.js)).

## Lokalisierungs-Rollout

| Locale | iOS-Ordner | Android-Ordner | Status |
| ------ | ---------- | -------------- | ------ |
| Deutsch | `de-DE` | `de-DE` | iOS ✓, Android ✓ |
| Französisch | `fr-FR` | `fr-FR` | iOS ✓, Android ✓ |
| Italienisch | `it` | `it-IT` | iOS ✓, Android ✓ |
| Englisch (US) | `en-US` | `en-US` | iOS ✓, Android ✓ |
| Englisch (UK) | `en-GB` | — | iOS ✓ (Kopie von en-US) |
| Englisch (AU) | `en-AU` | — | iOS ✓ (Kopie von en-US) |

iOS `it` vs. Android `it-IT` ist korrekt — **nicht** vereinheitlichen.

CI (`STORE_IOS_LOCALES`):

```yaml
STORE_IOS_LOCALES: de-DE,fr-FR,it,en-US,en-GB,en-AU
```

## Fastlane-Befehlsreferenz

```bash
# iOS Listing-Text (ohne Screenshots)
bundle exec fastlane ios upload_metadata

# iOS Screenshots aufnehmen + rahmen + hochladen (macOS)
bundle exec fastlane ios screenshots
bundle exec fastlane ios frame_shots
SKIP_SCREENSHOTS=false bundle exec fastlane ios upload_metadata

# Android Listing-Text + Changelogs (Changelogs standardmässig an)
GOOGLE_PLAY_JSON_KEY_PATH=... bundle exec fastlane android upload_metadata
SKIP_CHANGELOGS=true  ... # Changelog-Upload überspringen
SKIP_STORE_IMAGES=false SKIP_STORE_SCREENSHOTS=false ... # Bilder/Screenshots einschliessen

# Nur ausgewählte iOS-Locales
STORE_IOS_LOCALES=de-DE bundle exec fastlane ios upload_metadata
```

## Release-Checkliste (pro Version)

1. [ ] `release_notes.txt` (iOS, alle Locales) aktualisiert
2. [ ] `changelogs/default.txt` (Android, alle Locales) aktualisiert (≤ 500 Zeichen)
3. [ ] Promo-Text saisonal geprüft (`promotional_text.txt`)
4. [ ] Content Rating / Preise in ASC + Play verifiziert
5. [ ] Commit + Push → Workflow **Store metadata** lädt Texte hoch
6. [ ] Bei visueller Änderung: Screenshots neu generieren + hochladen (macOS)
7. [ ] Store-Links in [`public/start/index.html`](../../public/start/index.html) prüfen

### Release-Notes-Vorlage

```
• Neu: [Feature]
• Verbessert: [Bereich]
• Behoben: [Bug-Kategorie]
```

## Marketing-Integration

- Store-Badges + UTM-getrackte Links: bereits in
  [`public/start/index.html`](../../public/start/index.html) (CTA-Events
  `app_store` / `play_store`).
- UTM-Vorlagen: [`README.md`](./README.md).
- PostHog: CTA-Klicks landen als `marketing_cta_click` mit `cta`-Property.

## Nicht über Fastlane (manuell in den Konsolen)

| Massnahme | Wo | Priorität |
| --------- | -- | --------- |
| Apple Search Ads | Apple Search Ads | Mittel (nach Launch) |
| Google App Campaigns | Google Ads | Mittel |
| Custom Product Pages | App Store Connect | Niedrig |
| Listing Experiments | Play Console | Mittel |
| In-App Events | App Store Connect | Saisonal |
| Content Rating / Altersfreigabe | Beide Konsolen | Einmalig vor Launch |
| Preis-/Abo-Anzeige | ASC + Play + Stripe | Vor Go-Live prüfen |

## KPIs (3 Monate post-Launch)

| KPI | Quelle | Ziel |
| --- | ------ | ---- |
| Store-Impressionen | ASC + Play | Baseline |
| Produktseiten-Views | Store Analytics | +20 % nach Screenshot-Update |
| Conversion (View→Install) | Store Analytics | > 25 % |
| Keyword-Ranking «Imkerei»/«Bienen» | ASC Search Analytics | Top 20 CH |
| Landing → Store-Klick | PostHog | tracken |
| Bewertungen | Store Reviews | > 4.0, > 10 Reviews |
