# AGENTS.md

## Cursor Cloud specific instructions

Hively is a local-first Vanilla JS + Vite PWA (beehive tracker). See `README.md` for the
full overview and the standard commands in `package.json`.

### Services & how to run them

There is a single service: the Vite dev server.

- Dev server: `npm run dev` → http://localhost:5173/ (serves the PWA)
- Unit tests: `npm test` (Vitest, jsdom) — files under `tests/`
- E2E tests: `npm run test:e2e` (Playwright, Chromium) — specs under `e2e/`; config in
  `playwright.config.js`. Starts/reuses Vite on port 5173 via `webServer`.
  One-time on a fresh VM: `npx playwright install chromium` (CI uses `--with-deps`).
- Production build: `npm run build` (outputs to `dist/`); preview with `npm run preview`
- There is **no lint script** in `package.json`; linting is not part of this project.

### Non-obvious notes

- Domain entities: hives, inspections, finances, honey, **apiaries** (Bienenstände),
  **treatments** (Behandlungen). Apiaries belong to the active Betrieb (`operation_id`);
  hives link via `apiaryId`. Inspection structured fields live in `checklist` (JSONB).
  Supabase SQL: `supabase/migration_tier1_apiaries_treatments.sql` (apply manually if using sync).
- The app is **local-first and runs fully without any secrets or login**. Domain data
  is stored in the browser's `localStorage`, so it persists across page reloads but is
  per-browser-profile. No backend is required to develop or test core flows. Without a
  session the app seeds demo data on first load (`bee_tracker_demo_seeded`), including
  demo apiaries and an active treatment.
- Optional integrations are gated behind env vars and are **not needed** for local dev:
  - `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` enable cloud auth/sync. Absent → the app
    silently stays local-only (no login UI, no sync).
  - `GEMINI_API_KEY` is **server-only** (Vite dev middleware at `/api/gemini` + the Netlify
    function). Absent → the AI features (voice assistant, receipt scanner, weather insight)
    are unavailable, but the rest of the app works. Never prefix it with `VITE_`.
  - `VITE_GEMINI_PROXY_URL` (optional) overrides the absolute Gemini proxy URL used by
    Capacitor/iOS builds; default is `https://hivelyy.netlify.app/api/gemini`.
  - `VITE_POSTHOG_KEY` (optional) enables PostHog analytics. Absent → no tracking.
    Host defaults to EU (`VITE_POSTHOG_HOST`, default `https://eu.i.posthog.com`).
    Session replay is off unless `VITE_POSTHOG_SESSION_REPLAY=true`.
- Native Capacitor: Service Worker is **not** registered (assets ship in the IPA). Web PWA
  still registers `/sw.js`. Inspection weather falls back to a 7-day local cache when
  Open-Meteo is unreachable; «Alle Daten löschen» also wipes the offline-AI IndexedDB.
- Modals open with the CSS class `active` on `.modal-overlay` (not `open`). The header
  `#btn-quick-add` label changes by view (`+ Volk` on Kästen, `+ Kauf` on Finanzen).
- The iOS/Capacitor path (`npm run ios:*`), `fastlane/`, and `Gemfile` require macOS + Xcode
  and **cannot be built or run in the Linux cloud environment**. Ignore them for web
  /testing. After changing web code: `npm run ios:sync` before rebuilding in Xcode.
- UI text is German (Swiss). Hive management lives under the "Kästen" navigation;
  add a hive via the "+ Volk" button → "Neues Volk erfassen" form → "Speichern".
