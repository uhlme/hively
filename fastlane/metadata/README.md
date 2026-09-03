# Store-Listing-Texte (App Store + Google Play)

Alle Store-Beschreibungen liegen als Plain-Text in diesem Repo und können direkt in Cursor bearbeitet werden. Upload erfolgt über Fastlane — **kein** manuelles Copy-Paste in App Store Connect / Play Console nötig.

## Ordnerstruktur

### Apple App Store (`deliver`)

```
fastlane/metadata/
├── copyright.txt
├── primary_category.txt
├── secondary_category.txt
├── de-DE/          # Deutsch (Schweiz)
├── fr-FR/          # Französisch
├── it/             # Italienisch
└── en-US/          # Englisch
```

Pro Sprache:

| Datei | Limit | Inhalt |
|-------|-------|--------|
| `name.txt` | 30 Zeichen | App-Name |
| `subtitle.txt` | 30 Zeichen | Untertitel |
| `description.txt` | 4000 Zeichen | Vollständige Beschreibung |
| `keywords.txt` | 100 Zeichen | Komma-getrennt, ohne Leerzeichen nach Kommas |
| `promotional_text.txt` | 170 Zeichen | Promo-Text (jederzeit änderbar) |
| `release_notes.txt` | 4000 Zeichen | «Was ist neu» für die nächste Version |
| `privacy_url.txt` | URL | Datenschutz |
| `support_url.txt` | URL | Support |

Screenshots (optional): `fastlane/screenshots/<locale>/` — sind gitignored; Upload mit `SKIP_SCREENSHOTS=false` (Standard).

### Google Play Store (`supply`)

```
fastlane/metadata/android/
├── de-DE/
├── fr-FR/
├── it-IT/
└── en-US/
```

Pro Sprache:

| Datei | Limit | Inhalt |
|-------|-------|--------|
| `title.txt` | 30 Zeichen | App-Titel |
| `short_description.txt` | 80 Zeichen | Kurzbeschreibung |
| `full_description.txt` | 4000 Zeichen | Vollständige Beschreibung |
| `changelogs/default.txt` | 500 Zeichen | Release Notes |

## Upload

### GitHub Actions (empfohlen)

Workflow **Store metadata** → `workflow_dispatch` → Plattform wählen (`ios`, `android`, `both`).

Benötigte Secrets (bereits für TestFlight/Play vorhanden):

- iOS: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT`
- Android: `GOOGLE_PLAY_JSON_KEY_PATH` (oder `PLAY_STORE_JSON_KEY_BASE64` in CI)
- Optional: `PLAY_METADATA_TRACK` (Standard: `internal`; Listing-Upload nutzt die neueste Version auf diesem Track)

### Lokal

```bash
bundle install

# App Store (lokaler .p8-Schlüssel oder base64 in ASC_KEY_CONTENT)
ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_FILEPATH=/path/to/AuthKey.p8 \
  bundle exec fastlane ios upload_metadata

# Google Play
GOOGLE_PLAY_JSON_KEY_PATH=/path/to/play-service-account.json \
  bundle exec fastlane android upload_metadata
```

Nur Text, keine Screenshots (Standard):

```bash
bundle exec fastlane ios upload_metadata
GOOGLE_PLAY_JSON_KEY_PATH=... bundle exec fastlane android upload_metadata
```

**iOS-Sprachen filtern** (z. B. solange eine Version in Review ist und nur Deutsch in ASC aktiv ist):

```bash
STORE_IOS_LOCALES=de-DE bundle exec fastlane ios upload_metadata
```

Screenshots optional einschließen: `SKIP_SCREENSHOTS=false` (iOS) bzw. `SKIP_STORE_IMAGES=false SKIP_STORE_SCREENSHOTS=false` (Android).

Android-Screenshots erzeugen (Emulator muss laufen):

```bash
npm run android:sync
bundle exec fastlane android screenshots
bundle exec fastlane android frame_shots
```

**Hinweis:** Der Capture-Test darf die App **nicht** per `am force-stop` beenden — das killt die Instrumentation (`Process crashed` in CI). Neu starten läuft über `FLAG_ACTIVITY_CLEAR_TASK`. Gradle muss `:app:connectedDebugAndroidTest` nutzen (nicht alle Capacitor-Plugin-Module). PNGs liegen unter `/data/local/tmp/hively-store-screenshots` (nicht unter `Android/data/…`, weil `adb pull` dort auf API 30+ blockiert).

CI: Workflow **Store metadata** → Screenshot-Modus wählen:

- `none` — nur Texte
- `upload_existing` — vorhandene Repo-Screenshots hochladen (iOS + Android, ohne Capture)
- `generate_and_upload` — neu aufnehmen (iOS=macOS, Android=Linux-Emulator) und hochladen

## Workflow in Cursor

1. Text in `fastlane/metadata/` oder `fastlane/metadata/android/` anpassen
2. Commit + Push
3. GitHub Actions → **Store metadata** manuell starten
4. In App Store Connect / Play Console prüfen (Änderungen können einige Minuten brauchen)

**Hinweis:** Binär-Uploads (TestFlight, Play Internal) bleiben unverändert in `ios-testflight.yml` / `android-playtest.yml`. Store-Texte werden getrennt hochgeladen.
