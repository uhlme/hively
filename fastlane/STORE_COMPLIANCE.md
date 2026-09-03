# Store-Compliance via Fastlane

Was Hively über Fastlane automatisieren kann — und was in den Konsolen bleibt.

## App Store Connect (automatisiert)

| Thema | Mechanismus | Status |
|-------|-------------|--------|
| Listing-Texte + Privacy-/Support-URLs | `ios upload_metadata` (`deliver`) | CI auf Push |
| Altersfreigabe (Age Rating) | `fastlane/rating_config.json` → `deliver` `app_rating_config_path` | CI auf Push |
| Preis (Free = Tier 0) | `deliver` `price_tier` (Default `0`) | CI; bei API-Fehler: `SKIP_IOS_PRICE_TIER=true` |
| App Privacy Labels | `fastlane/app_privacy_details.json` → `ios upload_privacy` | **Lokal / manuell mit Apple-ID** (kein ASC API-Key) |

### Age Rating hochladen

Läuft mit dem normalen Metadata-Job (ASC API-Key):

```bash
bundle exec fastlane ios upload_metadata
```

### App Privacy Labels hochladen

Apple stellt dafür **keinen** App Store Connect API-Key-Endpunkt bereit. Es braucht eine
Apple-ID mit Owner/Admin (Session / App-specific password):

```bash
export APPLE_ID='you@example.com'
export FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD='xxxx-xxxx-xxxx-xxxx'
# optional: FASTLANE_TEAM_ID / APPLE_TEAM_ID
bundle exec fastlane ios upload_privacy
```

Oder GitHub Actions → **Store metadata** → `upload_ios_privacy=true` (Secrets
`APPLE_ID` + `FASTLANE_APPLE_APPLICATION_SPECIFIC_PASSWORD` bzw. `FASTLANE_SESSION`).

JSON anpassen bei neuen SDKs/Datenflüssen; Grundlage ist `public/privacy/`.

### Preis / Verfügbarkeit

- **Preis:** Free via `price_tier: 0` (übersteuerbar mit `STORE_IOS_PRICE_TIER`).
- **Länder/Verfügbarkeit:** Fastlane/ASC-API dafür unzuverlässig/deprecated → **einmal manuell** in ASC unter Pricing and Availability.

## Google Play (Fastlane-Grenzen)

| Thema | Fastlane `supply` | Manuell in Play Console |
|-------|-------------------|-------------------------|
| Listing-Texte + Screenshots/Images | Ja | — |
| Privacy-Policy-URL | Nein (nicht in `supply`) | App content / Store settings |
| Content Rating (IARC) | Nein | Fragebogen |
| Preis / Länder | Nein | Pricing & distribution |
| Data Safety | Nein | Fragebogen (CSV-Import möglich, aber nicht Fastlane) |

## Manuelle Checkliste (Rest)

### App Store Connect
- [ ] Pricing and Availability: Free + gewünschte Länder (falls noch nicht gesetzt)
- [ ] App Privacy Labels einmalig via `ios upload_privacy` **oder** ASC-UI (JSON als Vorlage)
- [ ] Business / Tax / Banking falls nötig
- [ ] Version zur Review einreichen + freigeben

### Google Play Console
- [ ] Privacy policy URL setzen
- [ ] Content Rating (IARC) abschliessen
- [ ] Data Safety Fragebogen
- [ ] Preis / Länder / Zielgruppe / Ads-Deklaration
- [ ] Produktion freigeben
