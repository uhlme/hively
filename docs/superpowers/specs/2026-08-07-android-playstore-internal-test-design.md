# Android Play Store Internal Testing — Design

## Goal

Get Hively onto the Google Play Store "internal testing" track, automated via GitHub Actions, mirroring the existing iOS TestFlight pipeline (`.github/workflows/ios-testflight.yml`).

## Context

- Capacitor web app (`ch.hively.app`), iOS platform already exists under `ios/App` with Fastlane + `match` + GitHub Actions → TestFlight.
- No Android platform exists yet in the repo.
- Google Play Console **developer account already exists**; no app entry, no keystore, no GCP project/service account yet.
- User explicitly wants full CI automation via `gh`/GitHub Actions, with secrets provisioned via `gh secret set`.

## Scope

In scope:
- Add Capacitor Android platform (`android/`), package id `ch.hively.app`.
- Generate a release signing keystore for Hively.
- Fastlane `android beta` lane using the `supply` action to upload a signed `.aab` to the **internal testing** track.
- New GitHub Actions workflow `android-playtest.yml`, triggered by `android-v*` tags (own tag namespace, independent from `ios-v*`) and `workflow_dispatch`, following the same pattern as `ios-testflight.yml` (checkout, install JS deps, build web, `cap sync android`, fastlane lane).
- New GCP project + service account for Play Developer API access, created via `gcloud` CLI where possible.
- GitHub repo secrets added via `gh secret set`: Android keystore (base64), keystore/key passwords + alias, and the Play service-account JSON key.

Out of scope (manual steps only the user can perform, no public API exists):
- Creating the app entry in Play Console (name, package, default language, category).
- Filling in the store listing, privacy policy URL, content rating questionnaire, target audience, data safety form — Play Console requires these before any track (including internal testing) can serve testers.
- Granting the GCP service account permissions inside Play Console under **Setup → API access**.
- Inviting internal testers (email list / Google Group) inside Play Console.

## Components & Flow

1. **Android platform**: `npx cap add android` scaffolds `android/`. `capacitor.config.json` already has the shared `appId`/`appName`, so no changes needed there.
2. **Keystore**: generate with `keytool -genkeypair` (release key, RSA 2048, 27+ year validity). Stored nowhere in the repo — only as a base64-encoded GitHub secret, decoded at CI time into the workspace (same pattern as the iOS temporary keychain: created fresh per run, not persisted).
3. **Fastlane**:
   - `fastlane/Fastfile` gets a new `platform :android` block, lane `beta`:
     - `gradle(task: "bundleRelease")` with signing properties injected via env vars written to `android/keystore.properties` at CI time.
     - `upload_to_play_store(track: "internal", aab: ..., json_key: ENV["PLAY_STORE_JSON_KEY_PATH"])`.
   - Version code: derived from `GITHUB_RUN_NUMBER` (mirrors the iOS build-number scheme); version name derived from the `android-v*` tag, same as `VERSION_NUMBER` handling in the iOS lane.
4. **Workflow** (`android-playtest.yml`):
   - Triggers: `push: tags: ['android-v*']`, `workflow_dispatch`.
   - `runs-on: ubuntu-latest` (Android builds don't need macOS, unlike iOS — faster/cheaper CI).
   - Steps: checkout → setup-node → setup-ruby (bundler for fastlane, shared Gemfile) → setup-java (Temurin 17, required by current Android Gradle Plugin) → `npm ci` → `npm run build` → `npx cap sync android` → decode keystore + service-account JSON from secrets into temp files → `bundle exec fastlane android beta` → always clean up temp key files.
   - Secrets consumed: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_STORE_JSON_KEY` (the full service-account JSON, base64-encoded to survive as a secret).
5. **GCP / Play Developer API access**:
   - `gcloud projects create` a new project (e.g. `hively-play-console`).
   - Enable `androidpublisher.googleapis.com`.
   - Create a service account, generate a JSON key.
   - Base64-encode the key and push it as `PLAY_STORE_JSON_KEY` via `gh secret set`.
   - **User must then manually** invite that service account's email in Play Console → Setup → API access, and grant it release-manager permissions for the app.

## Error Handling

- If the Play Developer API call fails because the app doesn't exist yet in Play Console (expected until the user completes the manual app-creation step), the workflow fails with a clear fastlane error — no special handling needed, this is a one-time bootstrapping gate, not a recurring failure mode.
- Keystore/service-account temp files are cleaned up with `if: always()`, matching the existing iOS keychain-cleanup pattern.

## Testing

- No new automated tests — this is a CI/release-pipeline change, verified by:
  - A local `bundleRelease` build succeeding before committing the workflow.
  - A `workflow_dispatch` dry run once the app exists in Play Console and the service account has been granted access.

## Open Dependencies Before First Successful Run

1. User creates the Play Console app entry + completes store listing / content rating / data safety.
2. User grants the new service account API access in Play Console.
3. User invites internal testers.

Until (1) and (2) are done, the workflow can be fully built and will run, but the final `upload_to_play_store` step will fail — this is expected and not a code defect.
