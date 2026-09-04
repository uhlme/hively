# Hively – Beehive Tracker

A PWA (Progressive Web App) for beekeepers to manage their hives, inspections, honey harvests, and expenses. Optimized for mobile use directly at the apiary.

## Features

- **Dashboard** – Quick overview: number of hives, honey yield, balance, Bienen-Radar (weather/pollen), and recent activity
- **Hive Management** – Track hives with queen name, breed, year, and health status
- **Inspections** – Log notes (multi-hive), weather at inspection time, and history per hive
- **AI Voice Assistant** – Dictate inspection notes hands-free (Gemini-powered, Swiss German)
- **Receipt Scanner** – Extract expense data from receipt photos via Gemini OCR
- **Finances** – Expenses, honey yields, and Bienenpatenschaften (sponsorships)
- **Season Calendar** – Monthly checklist for beekeeping tasks
- **Cloud Sync** – Optional synchronization via Supabase (login/registration) with offline sync queue
- **Offline-ready** – Local data storage and offline AI media cache

## Requirements

- [Node.js](https://nodejs.org/) ≥22 (see `.nvmrc`)
- npm
- For iOS builds: Xcode, CocoaPods, Apple Developer account

## Local Development

```bash
# Install dependencies
npm install

# Copy env template and fill in values (never commit `.env`)
cp .env.example .env

# Start development server (http://localhost:5173)
npm run dev
```

Without Supabase variables, the app runs fully local — no login, no sync.

## Build & Deployment (Web / Netlify)

```bash
# Create production build
npm run build

# Preview production build locally
npm run preview
```

The project is configured for Netlify (`netlify.toml`). Pushing to the main branch triggers an automatic deploy.

On Netlify, set these under **Site settings → Environment variables**:

| Variable | Notes |
|---|---|
| `VITE_SUPABASE_URL` | Same value in all deploy contexts |
| `VITE_SUPABASE_ANON_KEY` | Same value in all deploy contexts (public anon key) |
| `GEMINI_API_KEY` | Secret — Builds, Functions, Runtime |

`GEMINI_API_KEY` powers the Netlify Function `/api/gemini`. Without it, voice assistant, receipt scanner, and AI weather insights are unavailable in production.

## Environment Variables

| Variable | Local `.env` | Netlify | GitHub Actions (planned iOS CI) |
|---|---|---|---|
| `VITE_SUPABASE_URL` | yes | yes | yes (baked into the web bundle at build time) |
| `VITE_SUPABASE_ANON_KEY` | yes | yes | yes (baked into the web bundle at build time) |
| `GEMINI_API_KEY` | yes (dev middleware) | yes (server-only) | only if CI runs/tests the proxy — **not** needed for the iOS archive job |
| `VITE_GEMINI_PROXY_URL` | optional (Capacitor) | no | optional — absolute proxy URL baked into the native web bundle |
| `VITE_POSTHOG_KEY` | optional | optional | optional — Project API Key; absent → no analytics |
| `VITE_POSTHOG_HOST` | optional | optional | defaults to `https://eu.i.posthog.com` |
| `VITE_POSTHOG_SESSION_REPLAY` | optional | optional | `true` to enable masked session replay (default off) |
| `VITE_BILLING_ENABLED` | optional | optional | `true` = client soft-locks **and** server hard-gates (with Stripe keys) |
| `BILLING_ENABLED` | optional | Functions | optional alias of `VITE_BILLING_ENABLED` for Functions |
| `STRIPE_SECRET_KEY` | optional | Functions | server-only; Pro checkout (needs billing flag) |
| `STRIPE_WEBHOOK_SECRET` | optional | Functions | webhook signature |
| `STRIPE_PRICE_MONTHLY` | optional | Functions | Price ID for CHF 1.99/month |
| `STRIPE_PRICE_YEARLY` | optional | Functions | Price ID for CHF 10/year |
| `SUPABASE_SERVICE_ROLE_KEY` | optional | Functions | webhook writes plan on `operations` |
| `APP_ORIGIN` | optional | Functions | Checkout success/cancel base URL |

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-api-key
# Optional for Capacitor/iOS (defaults to https://hivelyy.netlify.app/api/gemini):
# VITE_GEMINI_PROXY_URL=https://hivelyy.netlify.app/api/gemini
# Optional analytics (EU host by default):
# VITE_POSTHOG_KEY=phc_...
# VITE_POSTHOG_HOST=https://eu.i.posthog.com
```

`GEMINI_API_KEY` is **server-only** (Vite dev middleware + Netlify Function `/api/gemini`).
Do **not** prefix it with `VITE_` — that would embed the key in the client bundle.
`VITE_GEMINI_PROXY_URL` is the public proxy URL only (no secret); used by the native app because relative `/api/gemini` does not exist under `capacitor://`.
`VITE_POSTHOG_KEY` is a public project key (designed for client use). Without it the app stays fully functional with analytics disabled.
Hively Pro (Stripe): CHF 1.99/month + CHF 10/year (14-day trial on first Checkout). Live catalog + go-live steps: [`docs/billing/stripe-go-live.md`](docs/billing/stripe-go-live.md). Set Stripe secrets + `VITE_BILLING_ENABLED=true` (or `BILLING_ENABLED=true`), webhook → `/api/stripe/webhook`. Apply billing SQL migrations, then enable DB Pro gates (`migration_billing_gates_go_live.sql` or `billing_gates_enabled=true`). Without the billing flag + Stripe keys, server Pro gates stay off (client soft-locks still need the flag).
Legal pages ship from `public/` (`/privacy/`, `/impressum/`, `/agb/`, `/delete-account/`) and must stay outside the SPA catch-all.
Share real values with collaborators out of band (password manager, etc.). Do not commit `.env` or paste secrets into issues/PRs.

### GitHub Actions secrets (planned TestFlight CI)

For the planned pipeline **GitHub Actions → macOS runner → Archive → TestFlight**, configure secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Injected into `npm run build` / `cap sync` |
| `VITE_SUPABASE_ANON_KEY` | Injected into `npm run build` / `cap sync` |
| `VITE_POSTHOG_KEY` | Optional — PostHog project API key baked into the web bundle |
| `VITE_POSTHOG_HOST` | Optional — defaults to `https://eu.i.posthog.com` in the iOS workflow |
| `VITE_POSTHOG_SESSION_REPLAY` | Optional — `true` to enable masked session replay |

The iOS workflow also bakes in (hardcoded, no secrets needed):
`VITE_BILLING_ENABLED=true`, `VITE_GEMINI_PROXY_URL=https://hivelyy.netlify.app/api/gemini`,
`VITE_STRIPE_API_ORIGIN=https://hivelyy.netlify.app`.

| Secret | Purpose |
|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | App Store Connect API key ID |
| `APP_STORE_CONNECT_API_ISSUER_ID` | App Store Connect issuer ID |
| `APP_STORE_CONNECT_API_KEY_P8` | Contents of the `.p8` private key |
| `IOS_CERTIFICATE_P12` | Distribution certificate (Base64) |
| `IOS_CERTIFICATE_PASSWORD` | Password for the `.p12` |
| `IOS_PROVISIONING_PROFILE` | Provisioning profile (Base64) |

Collaborators with repo access can run workflows that use these secrets; they cannot read secret values in the UI.

## iOS (Capacitor / TestFlight)

The app ships as a native iOS wrapper via [Capacitor](https://capacitorjs.com/), reusing the same
Vite build (`ios/App/App/public` is the synced `dist/` output — do not edit it directly).

### Manual build (current)

```bash
# Install JS dependencies (includes Capacitor)
npm install

# Ensure `.env` has VITE_SUPABASE_* (and optional VITE_POSTHOG_* for analytics)
cp .env.example .env   # if not already done

# Native pods (only needed after adding/updating Capacitor plugins)
npm run ios:pods

# Build the web app, sync it into the iOS project, and open Xcode
npm run ios:open
```

In Xcode:

1. Select the `App` target → **Signing & Capabilities** → choose your Apple Developer team
   (not committed to the repo — set once per checkout).
2. Bump the build number under **General** if you're re-uploading the same marketing version
   (`package.json` `version` / `MARKETING_VERSION` in the Xcode project).
3. **Product → Archive**, then in the Organizer **Distribute App → App Store Connect**.
4. In App Store Connect, assign the uploaded build to a TestFlight group.

Run `npm run ios:sync` after every change to the web app before rebuilding in Xcode.

`VITE_SUPABASE_*` and `VITE_POSTHOG_*` are embedded at `npm run build` time (same bundle as the PWA).
Events from TestFlight are tagged `platform: ios` via Capacitor detection. The Gemini API key stays
on the server (Netlify); the native app should call the production `/api/gemini` proxy, not ship the key in the IPA.

### Capgo OTA (native JS/CSS updates without store review)

After a store build that includes `@capgo/capacitor-updater`, push web-only updates with:

```bash
git tag ota-v0.6.13
git push origin ota-v0.6.13
```

GitHub Actions workflow **OTA Publish** builds `dist/`, creates a Capgo ZIP, and uploads it to
**Netlify Blobs** (channels `staging` + `production`). Requires secrets `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID` (Netlify API ID UUID). TestFlight/Play Internal (`v*` tags) use channel
`staging`; public store shells use `release-v*` (or workflow_dispatch `ota_channel=production`).
Native plugin or permission changes still need a store shell release.

### CI → TestFlight (planned)

A GitHub Actions workflow on a `macos-latest` runner is planned to:

1. Check out the repo and install Node dependencies
2. Build with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from GitHub secrets
3. `npx cap sync ios`
4. Import signing cert + provisioning profile
5. Archive and upload to App Store Connect / TestFlight (e.g. Fastlane or `xcodebuild`)

Until that workflow exists, use the manual Xcode path above. GitHub secrets alone do not replace a local `.env` for manual builds.

### Supabase migrations

Apply SQL files in `supabase/` in order, including `migration_security_hardening.sql`
(closes membership privilege escalation, tightens profile/invite exposure).

## Project Structure

```
src/
  main.js           # App entry point and UI logic
  storage.js        # Local data persistence + sync queue
  supabase.js       # Supabase client
  geminiApi.js      # Client → /api/gemini proxy
  weather.js        # Open-Meteo weather & pollen
  voiceAssistant.js # Voice capture + proxy parse
  receiptScanner.js # Receipt capture + proxy OCR
  offlineAI.js      # IndexedDB cache for offline AI media
  aiHelper.js       # Weather insight via proxy
  utils.js          # Shared helpers (HTML escape, JSON parse)
  style.css         # Global styles
server/
  geminiProxy.js    # Shared Gemini handler (key stays server-side)
netlify/functions/
  gemini.mjs        # Production AI proxy
public/
  sw.js             # Service worker
  manifest.json     # PWA manifest
supabase/           # Supabase migrations and config
```

## Tech Stack

- **Vite** – Build tool
- **Capacitor** – Native iOS wrapper / TestFlight
- **Netlify** – Web hosting and Gemini proxy function
- **Supabase** – Backend and authentication
- **Google Gemini** – AI voice assistant, receipt OCR, weather insight
- **Open-Meteo** – Weather and pollen data
- **Vanilla JS** – No frontend framework
