# Fastlane Screenshots + frameit

Dieser Ordner enthält die **Screenshot-Pipeline** für den App Store (iOS) und
Google Play (Android). PNGs sind gitignored – nur die Konfiguration ist im Repo.

## Ablauf (nur macOS, mit Xcode)

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
3. **Hochladen** – lädt die gerahmten Screenshots zu App Store Connect:
   ```bash
   SKIP_SCREENSHOTS=false bundle exec fastlane ios upload_metadata
   ```

## Benötigtes Asset

`frame_shots` braucht eine **`background.jpg`** in diesem Ordner (dunkler
Marken­hintergrund, z. B. `#1a1510`). Ohne Hintergrundbild rendert frameit
keinen Titeltext. Auflösung ≥ Screenshot-Grösse.

## Overlay-Texte

- `Framefile.json` – Styling (Akzent `#e08a3c`, Rahmen, Padding, Position).
- `<locale>/title.strings` – Headline pro Screenshot (Dateiname-Präfix als Key).
- `<locale>/keyword.strings` – Subline pro Screenshot.

Quelle der Texte: [`docs/marketing/aso-screenshot-texts.md`](../../docs/marketing/aso-screenshot-texts.md).
## Screenshot-Set

| Datei-Präfix | Screen | App-View | iPhone | iPad | Android |
| ------------ | ------ | -------- | ------ | ---- | ------- |
| `01Dashboard` | Übersicht              | `dashboard` | ✓ | ✓ | ✓ |
| `02Hives`     | Völker-Liste           | `hives`     | ✓ | ✓ | ✓ |
| `03Finances`  | Finanzen               | `finances`  | ✓ | ✓ | ✓ |
| `04Calendar`  | Saisonkalender         | `calendar`  | ✓ | ✓ | ✓ |
| `05Settings`  | Einstellungen / Offline | `settings`  | ✓ | ✓ | ✓ |

Der UI-Test in
[`ios/App/AppUITests/AppUITests.swift`](../../ios/App/AppUITests/AppUITests.swift)
startet die App pro Screenshot neu und öffnet die Ziel-View direkt über das
Launch-Argument `-hively-uitest-view <name>` (→ `MainViewController` setzt
`?view=<name>`, ausgewertet vom Router in `src/main.js`). Das vermeidet fragile
WebView-Tap-Navigation. Die Demo-Daten kommen über `-hively-uitest-seed`.
