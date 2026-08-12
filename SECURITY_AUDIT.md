# Sicherheits-Audit – Hively (Bee-Tracker)

**Erstes Audit:** 29. Juli 2026  
**Aktualisiert:** 10. August 2026 (Re-Review gegen aktuellen `main`)  
**Scope:** Authentifizierung, Autorisierung, API-Endpunkte, Eingabevalidierung, XSS, SQL-Injection, Datei-Uploads, Security-Headers

---

## Zusammenfassung (Stand Re-Review)

| Schweregrad | Offen | Behoben seit Erst-Audit | Teilweise |
|-------------|-------|-------------------------|-----------|
| Kritisch    | 0     | 1 (K1)                  | —         |
| Hoch        | 0 | 1 (H3); H1 akzeptiert; H2 Länge | H2 Rest → Mittel (anon Lookup / Rate-Limit) |
| Mittel      | 2 (M2 CSP, M3) | 2 (M1, M4)           | M2 Header |
| Niedrig     | 0–1 (N3 Rest) | 2 (N1, N2)            | N3 `/api/` |

**Go-Live-Rest (Security):** Invite-RPC Rate-Limit / `anon`-Zugriff (H2 Rest, Mittel), Content-Security-Policy (M2), optional Status-Whitelist (M3).

---

## Status-Übersicht

| ID | Thema | Status |
|----|--------|--------|
| K1 | Gemini ohne Auth | **Behoben** – Supabase-JWT via `authenticateRequest` |
| H1 | Client-AuthZ vs. RLS | **Akzeptiert / Design** – RLS ist Source of Truth; Cache-Clear bei Logout/Op-Wechsel vorhanden |
| H2 | Invite Brute-Force | **Teilweise** – Code 12 Zeichen + `crypto.getRandomValues` (~32^12); Rest **Mittel**: RPC weiter `anon`, kein Rate-Limit |
| H3 | Gemini Body-Size | **Behoben** – max. 10 MB (Vite + Netlify Function) |
| M1 | CORS Gemini | **Behoben** – Allowlist in `server/corsHeaders.js` |
| M2 | Security-Headers / CSP | **Teilweise** – XFO, nosniff, HSTS, Referrer, Permissions-Policy gesetzt; **CSP fehlt** |
| M3 | `statusToCssClass` | **Offen (gering)** – Sanitizer `[a-z0-9_-]`, keine Status-Whitelist |
| M4 | Audio-MIME | **Behoben** – Whitelist in `parseAudio` |
| N1 | `makeId` / `Math.random` | **Behoben** – `crypto.randomUUID()` / `getRandomValues` |
| N2 | Error-Leak Gemini | **Behoben** – Whitelist sicherer Messages, sonst generisch |
| N3 | Service Worker Cache | **Teilweise** – `/api/` und Netlify Functions ausgeschlossen; Same-Origin-Assets weiterhin gecacht |

---

## KRITISCH

### K1: Gemini-API-Endpunkt ohne Authentifizierung — BEHOBEN

**Dateien:** `server/geminiProxy.js` (`authenticateRequest`), `netlify/functions/gemini.mjs`

**Ursprünglich:** `POST /api/gemini` ohne Auth → Missbrauch von `GEMINI_API_KEY`.

**Aktueller Stand:** Jeder Request prüft `Authorization: Bearer <Supabase-JWT>` gegen `${SUPABASE_URL}/auth/v1/user`. Zusätzlich Rate-Limits (In-Memory + optional durable über `api_rate_limits` / Service-Role).

---

## HOCH

### H1: Client-seitige Autorisierungsprüfungen ohne Server-Enforcement — AKZEPTIERT

**Dateien:** `src/operations.js`, `src/storage.js`

**Bewertung unverändert:** UI-Rollen aus `localStorage` sind UX; **serverseitige Wahrheit = Supabase RLS** (`can_edit_operation` u. a.). Viewer können die UI nicht zuverlässig für Remote-Writes missbrauchen.

**Rest-Risiko:** Lokaler Cache kann nach Rollenwechsel kurz inkonsistent wirken. Mitigation: `clearLocalEntityCache()` bei Logout / Operationswechsel (bereits vorhanden). Kein Launch-Blocker.

---

### H2: Invite-Code Brute-Force — TEILWEISE OFFEN

**Dateien:** `src/operations.js` (`generateInviteCode`), `supabase/migration_security_hardening.sql` (`get_invite_by_code`)

**Behoben seit Erst-Audit:**
- Länge **12** Zeichen (statt 8), Alphabet **32** Zeichen → ~32^12 Kombinationen
  (Brute-Force praktisch nicht mehr „Hoch“; verbleibendes Risiko: Enumeration/`anon`-Lookup ohne Rate-Limit → **Mittel**)
- Generierung mit `crypto.getRandomValues`

**Noch offen:**
1. `get_invite_by_code` ist weiter für **`anon` und `authenticated`** executable
2. **Kein Rate-Limit** auf dem RPC (weder DB noch Edge-Proxy)

**Empfehlung vor/kurz nach Go-Live:** Rate-Limit (Edge Function / Postgres) und/oder RPC nur für `authenticated`.

---

### H3: Fehlende Request-Body-Grössenbeschränkung — BEHOBEN

**Dateien:** `vite.config.js`, `netlify/functions/gemini.mjs`

Explizites Limit **10 MB** → HTTP 413 bei Überschreitung.

---

## MITTEL

### M1: Kein CORS-Schutz am Gemini-Endpunkt — BEHOBEN

**Dateien:** `server/corsHeaders.js`, Gemini- + Stripe-Handler

Allowlist über App-Origin / `APP_ORIGIN` / bekannte Deploy-Hosts; `Access-Control-Allow-*` für `POST`/`OPTIONS` inkl. `Authorization`.

---

### M2: Fehlende Content-Security-Policy und Security-Headers — TEILWEISE

**Datei:** `netlify.toml`

**Gesetzt:**
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(self), geolocation=(self)`

**Noch offen:** `Content-Security-Policy` (sinnvoll mit `'self'`, Supabase, Open-Meteo, PostHog-EU, ggf. Stripe.js — vorsichtig testen wegen Inline-Styles / Vite-Bundles).

---

### M3: `statusToCssClass` ohne Status-Whitelist — OFFEN (gering)

**Datei:** `src/utils.js`

Weiterhin Sanitizer auf `[a-z0-9_-]`. XSS unwahrscheinlich; Risiko beschränkt auf Class-Pollution. Fix: Whitelist bekannter Hive-Status-Klassen.

---

### M4: Audio-MIME-Type nicht validiert — BEHOBEN

**Datei:** `server/geminiProxy.js`

Whitelist (`audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`, `audio/mpeg`, `audio/mp3`); Fallback `audio/webm`. Receipt-Images weiterhin separat MIME-/Grössen-geprüft.

---

## NIEDRIG

### N1: `makeId` mit `Math.random()` — BEHOBEN

**Datei:** `src/utils.js` — `crypto.randomUUID()` bzw. `getRandomValues`-Fallback.

---

### N2: Error-Messages leaken interne Details — BEHOBEN

**Datei:** `server/geminiProxy.js` — nur whitelisted Messages an den Client; sonst generisch `KI-Anfrage fehlgeschlagen.`

---

### N3: Service Worker cached potentiell sensible Daten — TEILWEISE

**Datei:** `public/sw.js`

**Behoben:** Kein Runtime-Cache für `/api/` und `/.netlify/functions/`.  
**Rest:** Same-Origin-GETs (Shell/Assets) werden weiterhin gecacht — für eine local-first PWA erwartet; Supabase-Traffic geht typischerweise cross-origin und liegt nicht im App-SW-Cache.

---

## Positiv-Befunde (korrekt / seit Audit gestärkt)

1. **Kein SQL-Injection-Risiko:** Kein raw SQL im JS; Supabase Query Builder / RPC.
2. **XSS:** `escapeHtml()` bei `innerHTML`; Status-Text wird escaped.
3. **RLS:** Domain-Tabellen operations-basiert; `migration_security_hardening.sql` (u. a. keine Owner-Invites).
4. **Gemini:** JWT-Auth, CORS-Allowlist, Body-Limit, Audio-/Receipt-MIME, Rate-Limits; Key nur serverseitig.
5. **IDs / Invites:** kryptographisch starke Zufallswerte; Invite-Länge 12.
6. **Security-Headers** (ohne CSP) in `netlify.toml`.
7. **Billing-Härtung (Design):** Client Soft-Locks + Server Hard-Gates / RLS hinter `billing_gates_enabled` (Default `false` bis Go-Live).
8. **Passwort/Auth:** Supabase Auth; `.env` gitignored; Anon-Key bewusst öffentlich.

---

## Empfohlene Priorisierung (aktuell)

1. **Vor/bei Go-Live:** H2 Rest (Invite Rate-Limit und/oder kein `anon` auf Lookup) — Residual **Mittel**
2. **Kurz danach:** M2 CSP (mit Staging-Test gegen AI/Sync/Analytics/Stripe)
3. **Nice-to-have:** M3 Status-Whitelist; N3 nur bei Shared-Device-Szenarien neu bewerten

---

## Hinweis Ops

Dieses Dokument beschreibt den **Code-Stand**. Ob Migrationen (`migration_security_hardening.sql`, Rate-Limits, Billing-Gates) und Env-Vars in **Produktion** aktiv sind, ist separat zu prüfen (Supabase SQL Editor / Netlify Env).
