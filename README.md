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
- **Offline-ready** – Local data storage, offline AI media cache, JSON backup and restore

## Requirements

- [Node.js](https://nodejs.org/) (v18+)
- npm

## Local Development

```bash
# Install dependencies
npm install

# Start development server (http://localhost:5173)
npm run dev
```

## Build & Deployment

```bash
# Create production build
npm run build

# Preview production build locally
npm run preview
```

The project is configured for Netlify (`netlify.toml`). Pushing to the main branch triggers an automatic deploy.

## Environment Variables

Create a `.env` file as needed:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-gemini-api-key
```

Without Supabase variables, the app runs fully local — no login, no sync.

`GEMINI_API_KEY` is **server-only** (Vite dev middleware + Netlify Function `/api/gemini`).
Do not use a `VITE_` prefix — that would embed the key in the client bundle.
On Netlify, set `GEMINI_API_KEY` in Site settings → Environment variables.
Without it, voice assistant, receipt scanner, and AI weather insights are unavailable.

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
- **Supabase** – Backend and authentication
- **Google Gemini** – AI voice assistant, receipt OCR, weather insight
- **Open-Meteo** – Weather and pollen data
- **Vanilla JS** – No frontend framework
