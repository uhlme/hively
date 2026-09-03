# Fastlane Screenshots + frameit

Dieser Ordner enthält die **Screenshot-Pipeline** für den App Store (iOS) und
Google Play (Android). Roh-PNGs sind gitignored – Konfiguration und gerahmte
`*_framed.png` können im Repo bleiben.

## iOS (macOS + Xcode)

Der UI-Test öffnet 5 Screens (App-Neustart je Screen mit `-hively-uitest-view`)
und seedet vorher deterministische Demo-Daten (via Launch-Argument
`-hively-uitest-seed` →
[`ios/App/App/MainViewController.swift`](../../ios/App/App/MainViewController.swift)
→ [`src/devSeed.js`](../../src/devSeed.js)), damit die Screens gefüllt sind.

1. **Aufnehmen** – legt PNGs unter
   `de-DE/6.9-Display/` und `de-DE/13-Display/` ab:
   ```bash
   npm run ios:sync   # Web bauen + in die iOS-App synchronisieren
   bundle exec fastlane ios screenshots
   ```
2. **Rahmen + Text** – legt Geräterahmen und die Overlay-Texte aus
   `title.strings` / `keyword.strings` über die Rohbilder (frameit):
   ```bash
   bundle exec fastlane ios frame_shots
   ```
3. **Hochladen** – lädt die gerahmten Screenshots zu App Store Connect.
   `deliver` braucht eine **flache** Locale-Struktur (`de-DE/*.png`); die Lane
   flacht `6.9-Display/` / `13-Display/` beim Upload automatisch ab:
   ```bash
   SKIP_SCREENSHOTS=false bundle exec fastlane ios upload_metadata
   ```

CI: GitHub Actions → **Store metadata** → Platform `ios`/`both` und Screenshot-Modus:

| `screenshots` | Verhalten |
| ------------- | --------- |
| `none` | nur Listing-Text |
| `upload_existing` | committete PNGs unter `fastlane/screenshots/` hochladen (kein Capture, Ubuntu) |
| `generate_and_upload` | neu aufnehmen auf macOS, dann hochladen |

Lokal nur vorhandene hochladen (ersetzt ASC-Screenshots derselben Größe;
andere Geräte-Größen bleiben, solange `OVERWRITE_SCREENSHOTS` nicht gesetzt ist):

```bash
SKIP_SCREENSHOTS=false bundle exec fastlane ios upload_metadata
# Vollständiges Ersetzen aller Größen:
# OVERWRITE_SCREENSHOTS=true SKIP_SCREENSHOTS=false bundle exec fastlane ios upload_metadata
```

## Android (Linux-Emulator oder lokales Gerät)

Analog zur iOS-Strecke, aber **ohne Mac**: Instrumentation-Test
[`ScreenshotCaptureTest`](../../android/app/src/androidTest/java/ch/hively/app/ScreenshotCaptureTest.java)
startet [`MainActivity`](../../android/app/src/main/java/ch/hively/app/MainActivity.java)
pro Screen mit Intent-Extras `hively_uitest_seed` + `hively_uitest_view`.

Voraussetzung: laufender Emulator/Gerät (`adb devices`).

1. **Aufnehmen** → `android/de-DE/phone/*.png`:
   ```bash
   npm run android:sync
   bundle exec fastlane android screenshots
   ```
2. **Rahmen + Text** → gerahmte PNGs + Kopie nach
   `fastlane/metadata/android/de-DE/images/phoneScreenshots/`:
   ```bash
   bundle exec fastlane android frame_shots
   ```
3. **Hochladen**:
   ```bash
   SKIP_STORE_SCREENSHOTS=false SKIP_STORE_IMAGES=false \
     bundle exec fastlane android upload_metadata
   ```

CI: GitHub Actions → **Store metadata** → Platform `android`/`both` und Screenshot-Modus:

| `screenshots` | Verhalten |
| ------------- | --------- |
| `none` | nur Listing-Text |
| `upload_existing` | PNGs aus `metadata/.../phoneScreenshots/` (oder gerahmte unter `screenshots/android/`) hochladen — kein Emulator |
| `generate_and_upload` | Emulator-Capture (`reactivecircus/android-emulator-runner`), dann Upload |

Lokal nur vorhandene hochladen:

```bash
bundle exec fastlane android verify_existing_screenshots
SKIP_STORE_SCREENSHOTS=false SKIP_STORE_IMAGES=false \
  bundle exec fastlane android upload_metadata
```

## Benötigtes Asset

`frame_shots` braucht eine **`background.jpg`** in diesem Ordner (dunkler
Marken­hintergrund, z. B. `#1a1510`). Ohne Hintergrundbild rendert frameit
keinen Titeltext. Auflösung ≥ Screenshot-Grösse.

## Overlay-Texte

- `Framefile.json` – Styling (Akzent `#e08a3c`, Rahmen, Padding, Position).
- `de-DE/title.strings` – Headline pro Screenshot (Dateiname-Präfix als Key).
- `de-DE/keyword.strings` – Subline pro Screenshot.

Quelle der Texte: [`docs/marketing/aso-screenshot-texts.md`](../../docs/marketing/aso-screenshot-texts.md).

## Screenshot-Set

| Datei-Präfix | Screen | App-View | iPhone | iPad | Android |
| ------------ | ------ | -------- | ------ | ---- | ------- |
| `01Dashboard` | Übersicht              | `dashboard` | ✓ | ✓ | ✓ |
| `02Hives`     | Völker-Liste           | `hives`     | ✓ | ✓ | ✓ |
| `03Finances`  | Finanzen               | `finances`  | ✓ | ✓ | ✓ |
| `04Calendar`  | Saisonkalender         | `calendar`  | ✓ | ✓ | ✓ |
| `05Settings`  | Einstellungen / Offline | `settings`  | ✓ | ✓ | ✓ |

iOS: Launch-Args `-hively-uitest-view` / `-hively-uitest-seed` →
`MainViewController`. Android: Intent-Extras gleichen Namens → `MainActivity`.
Beide setzen `localStorage` + `?view=` bevor die Web-App rendert.
