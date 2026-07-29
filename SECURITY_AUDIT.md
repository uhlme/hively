# Sicherheits-Audit – Hively (Bee-Tracker)

**Datum:** 29. Juli 2026
**Scope:** Authentifizierung, Autorisierung, API-Endpunkte, Eingabevalidierung, XSS, SQL-Injection, Datei-Uploads

---

## Zusammenfassung

| Schweregrad | Anzahl |
|-------------|--------|
| Kritisch    | 1      |
| Hoch        | 3      |
| Mittel      | 4      |
| Niedrig     | 3      |

---

## KRITISCH

### K1: Gemini-API-Endpunkt ohne Authentifizierung

**Datei:** `server/geminiProxy.js` (Zeile 267–287), `netlify/functions/gemini.mjs`, `vite.config.js` (Zeile 26)

**Schwachstelle:** Der Endpunkt `POST /api/gemini` erfordert keinerlei Authentifizierung. Jeder Internetnutzer kann beliebig viele KI-Anfragen senden und damit den API-Schlüssel des Betreibers missbrauchen.

**Exploit:**
```bash
curl -X POST https://example.com/api/gemini \
  -H "Content-Type: application/json" \
  -d '{"action":"weather_insight","weatherData":{"temperature":20,"conditionText":"sunny","windSpeed":5}}'
```

**Auswirkung:** Unbegrenzter Verbrauch des GEMINI_API_KEY → Kosten-Explosion, Denial-of-Service durch Rate-Limiting beim Provider.

**Fix:** Supabase-JWT in jedem Request validieren (Header `Authorization: Bearer <token>`), bevor die Anfrage an Gemini weitergeleitet wird. Alternativ ein einfaches Rate-Limiting und einen API-Secret-Header einführen.

**Konkreter Fix in `server/geminiProxy.js`:**
```javascript
export async function handleGeminiRequest(body, authHeader) {
  // Validate Supabase JWT
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(401, 'Authentifizierung erforderlich.');
  }
  // Verify JWT with Supabase (or at minimum check it exists)
  // ... existing code ...
}
```

---

## HOCH

### H1: Client-seitige Autorisierungsprüfungen ohne Server-Enforcement

**Dateien:** `src/operations.js` (Zeilen 36–48), `src/storage.js` (Zeilen 536, 547, 589, 614, 629, 647, 667, 679)

**Schwachstelle:** Rollen-Checks wie `canEditOperation()` und `isOperationOwner()` lesen die Rolle aus `localStorage`. Ein Angreifer kann im Browser `localStorage.setItem('hively_active_operation_role', 'owner')` setzen und damit alle clientseitigen Zugriffskontrollen umgehen.

**Hinweis:** Die tatsächliche Sicherheit liegt in den Supabase RLS-Policies, die serverseitig durchgesetzt werden. Die client-seitigen Checks sind nur UI-Komfort. **Das bedeutet:** Ein Viewer, der sich lokal als Owner ausgibt, kann zwar die UI freischalten und eine Supabase-Anfrage senden, aber RLS blockiert den Schreibvorgang. Dies ist korrekt designt, **aber:**

- `getFinances()` gibt bei Nicht-Ownern ein leeres Array zurück (`storage.js:614`), was ein reiner Client-Check ist. Das RLS filtert separat – aber die Client-Logik könnte die lokalen (localStorage) Finanzdaten anzeigen, die beim letzten Sync eines Owners gecacht wurden.
- Der `syncOrQueue`-Pfad fügt Änderungen in die lokale Sync-Queue ein, auch wenn die spätere Remote-Upsert scheitert. Dies führt zu verwirrenden Zuständen.

**Fix:** Die Client-Checks sind als UX-Hinweis akzeptabel, aber die lokale Cache-Logik muss berücksichtigen, dass gecachte Daten von einem früheren Benutzer mit höherer Rolle stammen könnten. Beim Wechsel der aktiven Operation oder beim Logout **muss** `clearLocalEntityCache()` aufgerufen werden (wird bereits gemacht).

**Bewertung:** Effektive Sicherheit liegt bei Supabase RLS → **designtechnisch korrekt, aber fragil.** Empfehlung: `getFinances()` sollte stets remote fetchen, wenn online, statt nur auf den Client-Check zu vertrauen.

---

### H2: Invite-Code Brute-Force möglich

**Datei:** `src/operations.js` (Zeile 216–219)

**Schwachstelle:** Der Invite-Code ist 8 Zeichen lang aus einem 31-Zeichen-Alphabet (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`). Das ergibt 31^8 ≈ 8.5 × 10^11 Kombinationen. Der `get_invite_by_code`-RPC ist für `anon`-Benutzer zugänglich (ohne Authentifizierung). Es gibt kein Rate-Limiting auf Supabase-Seite.

**Exploit:** Ein Angreifer kann automatisiert Invite-Codes durchprobieren:
```javascript
for (let i = 0; i < 1000000; i++) {
  await supabase.rpc('get_invite_by_code', { invite_code: generateCode() });
}
```

**Fix:**
1. Rate-Limiting auf der `get_invite_by_code`-Funktion (z.B. via `pg_rate_limiter` oder Supabase Edge Function als Proxy)
2. Invite-Code-Länge auf 12+ Zeichen erhöhen
3. `get_invite_by_code` nur für `authenticated` statt `anon` freigeben

---

### H3: Fehlende Request-Body-Grössenbeschränkung am Gemini-Endpunkt

**Datei:** `vite.config.js` (Zeile 39), `netlify/functions/gemini.mjs` (Zeile 17)

**Schwachstelle:** Der Vite-Dev-Middleware liest den gesamten Request-Body ohne Grössenbegrenzung. Ein Angreifer kann beliebig grosse JSON-Payloads senden und den Server-Speicher füllen (DoS).

**Fix:** Body-Grösse begrenzen (z.B. 10 MB):
```javascript
const raw = await readRequestBody(req);
if (raw.length > 10 * 1024 * 1024) {
  sendJson(res, 413, { error: 'Payload zu gross.' });
  return;
}
```

Netlify Functions haben standardmässig ein Limit, aber es sollte explizit in der Funktion geprüft werden.

---

## MITTEL

### M1: Kein CORS-Schutz am Gemini-Endpunkt

**Datei:** `server/geminiProxy.js` (Zeile 64–67), `vite.config.js` (Zeile 27–28)

**Schwachstelle:** Der OPTIONS-Handler gibt `204` zurück, ohne CORS-Header zu setzen. In der Produktion (Netlify) werden keine `Access-Control-Allow-Origin`-Header definiert. Je nach Netlify-Konfiguration könnte dies dazu führen, dass andere Websites den Endpunkt aufrufen können.

**Fix:** Explizite CORS-Header setzen, die nur die eigene Domain erlauben:
```javascript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://your-domain.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
```

---

### M2: Fehlende Content-Security-Policy und Security-Headers

**Datei:** `index.html`, `netlify.toml`

**Schwachstelle:** Die Anwendung setzt keine CSP-, X-Frame-Options-, X-Content-Type-Options- oder Strict-Transport-Security-Header.

**Fix:** In `netlify.toml` hinzufügen:
```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-Content-Type-Options = "nosniff"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Content-Security-Policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://api.open-meteo.com https://air-quality-api.open-meteo.com; img-src 'self' data:; font-src 'self'"
    Referrer-Policy = "strict-origin-when-cross-origin"
```

---

### M3: `statusToCssClass` erlaubt CSS-Class-Injection

**Datei:** `src/utils.js` (Zeile 56–61), `src/main.js` (Zeile 900)

**Schwachstelle:** Die Funktion `statusToCssClass()` wird in Template-Literalen als CSS-Klassenname verwendet:
```javascript
`<span class="status-badge status-${statusToCssClass(hive.status)}">
```
Die Funktion filtert zwar Sonderzeichen, aber ein Angreifer, der den `status`-Wert in der DB kontrolliert, könnte versuchen, bestehende CSS-Klassen zu injizieren. Da der Sanitizer nur `[a-z0-9_-]` erlaubt, ist das Risiko gering, aber der Ansatz ist fragil.

**Fix:** Whitelist für erlaubte Status-Werte verwenden:
```javascript
const ALLOWED_STATUSES = new Set(['gesund', 'varroa-behandlung', 'schwach', 'aufgelöst', 'weisellos']);
const statusClass = ALLOWED_STATUSES.has(statusToCssClass(status)) ? statusToCssClass(status) : 'unbekannt';
```

---

### M4: Audio-MIME-Type wird nicht serverseitig validiert

**Datei:** `server/geminiProxy.js` (Zeile 135–151)

**Schwachstelle:** Die `parseAudio`-Funktion akzeptiert jeden `mimeType` vom Client (`payload.mimeType || 'audio/webm'`). Ein Angreifer könnte beliebige Dateitypen als Audio-Daten senden.

**Fix:** MIME-Type-Whitelist hinzufügen:
```javascript
const ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg']);
const mimeType = ALLOWED_AUDIO_TYPES.has(payload.mimeType) ? payload.mimeType : 'audio/webm';
```

---

## NIEDRIG

### N1: `makeId` verwendet `Math.random()` – kryptographisch unsicher

**Datei:** `src/utils.js` (Zeile 111–118)

**Schwachstelle:** Entity-IDs werden mit `Math.random()` generiert. Das ist vorhersagbar. Da IDs als Primary Keys in Supabase verwendet werden, könnte ein Angreifer theoretisch existierende IDs erraten und per Upsert Daten überschreiben (RLS schützt jedoch gegen das Überschreiben fremder Daten).

**Fix:** `crypto.randomUUID()` verwenden:
```javascript
export function makeId(prefix) {
  return prefix + crypto.randomUUID();
}
```

---

### N2: Error-Messages leaken interne Details

**Datei:** `server/geminiProxy.js` (Zeile 284–285)

**Schwachstelle:** Die Fehlermeldung `err.message` wird direkt an den Client zurückgegeben. Dies kann interne Informationen preisgeben (z.B. API-Schlüssel-Fragmente, interne Pfade).

**Fix:** Generische Fehlermeldung zurückgeben, Details nur loggen:
```javascript
console.error('[geminiProxy]', err);
return fail(502, 'KI-Anfrage fehlgeschlagen.');
// Nicht: return fail(502, err.message || '...');
```

---

### N3: Service Worker cached potentiell sensible Daten

**Datei:** `public/sw.js` (Zeile 74–142)

**Schwachstelle:** Der Service Worker cached alle gleich-origin Antworten im Browser-Cache. Auf geteilten Geräten könnten gecachte API-Antworten von einem anderen Benutzer gelesen werden.

**Fix:** Nur statische Assets cachen, keine API-Antworten. Supabase-API-Anfragen explizit ausschliessen:
```javascript
if (url.pathname.startsWith('/rest/') || url.hostname.includes('supabase')) return;
```

---

## Positiv-Befunde (korrekt implementiert)

1. **Kein SQL-Injection-Risiko:** Kein raw SQL im Anwendungscode. Alle DB-Zugriffe erfolgen über den Supabase Client-SDK mit Parameterisierung.

2. **XSS-Schutz weitgehend vorhanden:** `escapeHtml()` wird konsequent in allen innerHTML-Zuweisungen verwendet. Die Funktion escaped `&`, `<`, `>`, `"`, `'` korrekt.

3. **RLS korrekt konfiguriert:** Alle Tabellen haben Row-Level-Security aktiviert. Policies sind operations-basiert und verwenden `security definer`-Funktionen zur Vermeidung von RLS-Rekursion.

4. **Invite-Privilegien-Eskalation blockiert:** `migration_security_hardening.sql` verhindert korrekt, dass Invites die Rolle `owner` vergeben können (CHECK-Constraint + Sanitisierung in `join_operation_with_code`).

5. **Supabase-Anon-Key nicht geheim:** Der `VITE_SUPABASE_ANON_KEY` ist ein öffentlicher Schlüssel (designed to be public) – kein Sicherheitsproblem.

6. **Datei-Upload-Validierung vorhanden:** Receipt-Scanner validiert Dateityp und -grösse sowohl client- als auch serverseitig (8 MB Limit, Image-MIME-Types).

7. **GEMINI_API_KEY serverseitig:** Der API-Key wird nie an den Client gesendet. Korrekt als Server-Side-Secret behandelt.

8. **Passwort-Handling delegiert an Supabase:** Kein eigener Passwort-Hash, kein eigener JWT – Supabase Auth übernimmt alles mit bcrypt und sicheren Tokens.

9. **`.env` in `.gitignore`:** Keine Secrets im Repository.

---

## Empfohlene Priorisierung

1. **Sofort:** K1 (Gemini-Endpunkt authentifizieren)
2. **Kurzfristig:** H2 (Invite-Code stärken), H3 (Body-Size-Limit)
3. **Mittelfristig:** M1 (CORS), M2 (Security-Headers), M4 (Audio-MIME)
4. **Bei Gelegenheit:** N1-N3
