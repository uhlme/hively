# AGENTS.md

## Cursor Cloud specific instructions

Hively is a local-first Vanilla JS + Vite PWA (beehive tracker). See `README.md` for the
full overview and the standard commands in `package.json`.

### Services & how to run them

There is a single service: the Vite dev server.

- Dev server: `npm run dev` → http://localhost:5173/ (serves the PWA)
- Tests: `npm test` (Vitest, jsdom) — currently 8 files / 51 tests
- Production build: `npm run build` (outputs to `dist/`); preview with `npm run preview`
- There is **no lint script** in `package.json`; linting is not part of this project.

### Non-obvious notes

- The app is **local-first and runs fully without any secrets or login**. Domain data
  (hives, inspections, finances, harvests) is stored in the browser's `localStorage`, so it
  persists across page reloads but is per-browser-profile. No backend is required to develop
  or test core flows (e.g. creating a "Volk"/hive).
- Optional integrations are gated behind env vars and are **not needed** for local dev:
  - `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` enable cloud auth/sync. Absent → the app
    silently stays local-only (no login UI, no sync).
  - `GEMINI_API_KEY` is **server-only** (Vite dev middleware at `/api/gemini` + the Netlify
    function). Absent → the AI features (voice assistant, receipt scanner, weather insight)
    are unavailable, but the rest of the app works. Never prefix it with `VITE_`.
- The iOS/Capacitor path (`npm run ios:*`), `fastlane/`, and `Gemfile` require macOS + Xcode
  and **cannot be built or run in the Linux cloud environment**. Ignore them for web dev/testing.
- UI text is German (Swiss). Hive management lives under the "Bienen"/"Kästen" navigation;
  add a hive via the "+ Volk" button → "Neues Volk erfassen" form → "Speichern".
