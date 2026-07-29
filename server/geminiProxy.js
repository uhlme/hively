/**
 * Server-side Gemini proxy — keeps GEMINI_API_KEY off the client.
 * Shared by the Netlify function and the Vite dev middleware.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseGeminiJson } from '../src/utils.js';

const MODEL = 'gemini-2.5-flash';
const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMITS = {
  weather_insight: 60,
  hive_recommendation: 60,
  parse_receipt: 20,
  parse_audio: 10
};
const requestBuckets = new Map();
const ALLOWED_RECEIPT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]);
const ALLOWED_CATEGORIES = new Set([
  'Hardware',
  'Futter',
  'Bienen',
  'Imkereibedarf',
  'Sonstiges'
]);

const AUDIO_PROMPT = `Du bist eine KI zur Analyse von gesprochenen Imker-Protokollen bei einer Durchsicht von Bienenvölkern.
Höre dir die beigefügte Audiodatei genau an. Sie ist auf Schweizerdeutsch (Mundart) gesprochen.
Verstehe den Dialekt, übersetze ihn gedanklich ins Hochdeutsche und extrahiere die relevanten Daten.
Liefere ein strukturiertes JSON-Objekt zurück.

Formatvorgabe (JSON):
{
  "hiveNames": ["Array von erkannten Kasten-Namen, z.B. ['Kasten 1', 'Kasten 2']. Falls der Benutzer explizit 'alle' oder 'bei allen' sagt, liefere ['alle'] zurück. Leeres Array [], wenn keine genannt wurden."],
  "notes": "Eine übersichtliche, strukturierte Zusammenfassung der gesamten Durchsicht auf Hochdeutsch. Fasse alle beobachteten Details wie Brutstatus, Honigraum, Sanftmut, Fütterung, Varroabehandlung und sonstige Arbeiten in lesbaren, strukturierten Notizen zusammen."
}

Wichtig:
- Antworte AUSSCHLIESSLICH mit dem validen JSON-Objekt.
- Füge keine Markdown-Formatierung wie \`\`\`json oder sonstigen Text hinzu.
- Setze nicht erwähnte Felder auf ein leeres Array oder null.`;

const RECEIPT_PROMPT = `Du bist ein Beleg-Scanner für eine Imker-App.
Analysiere das beigefügte Bild der Quittung/Rechnung.
Extrahiere die folgenden Informationen und gib sie als strukturiertes JSON-Objekt zurück:
- date: Das Belegdatum im Format YYYY-MM-DD (falls nicht auffindbar, nimm das heutige Datum im gleichen Format: YYYY-MM-DD).
- description: Eine kurze Zusammenfassung der wichtigsten gekauften Artikel (z.B. "10x Absperrgitter, Zander Beute").
- category: Weise dem Kauf eine der folgenden Kategorien zu: "Hardware", "Futter", "Bienen", "Imkereibedarf", "Sonstiges".
- price: Der Gesamtbetrag (Total/Endsumme) als Dezimalzahl (z.B. 129.50). Ignoriere Währungssymbole, liefere nur die reine Zahl.

Formatvorgabe (JSON):
{
  "date": "YYYY-MM-DD",
  "description": "Artikelbeschreibung",
  "category": "KategorieName",
  "price": 129.50
}

Wichtig:
- Antworte AUSSCHLIESSLICH mit dem validen JSON-Objekt.
- Füge keine Markdown-Formatierung wie \`\`\`json oder sonstigen Text hinzu.
- Verwende exakt die vorgegebenen Kategorienamen (Hardware, Futter, Bienen, Imkereibedarf, Sonstiges) - passe sie wenn nötig an.
- Setze nicht erkennbare Felder auf plausible Werte (z.B. heutigen Tag für Datum, "Unbekannter Beleg" für Beschreibung).`;

export const GEMINI_JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
}

function getSupabaseUrl() {
  return process.env.VITE_SUPABASE_URL || '';
}

function getSupabaseAnonKey() {
  return process.env.VITE_SUPABASE_ANON_KEY || '';
}

function ok(body) {
  return { status: 200, body };
}

function fail(status, error) {
  return { status, body: { error } };
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    normalized[String(key).toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return normalized;
}

async function authenticateRequest(headers = {}) {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: fail(503, 'Authentifizierung für den KI-Proxy ist nicht konfiguriert.') };
  }

  const authHeader = headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { error: fail(401, 'Login erforderlich für KI-Anfragen.') };
  }

  let response;
  try {
    response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: authHeader
      }
    });
  } catch (err) {
    console.error('[geminiProxy] auth validation failed', err);
    return { error: fail(502, 'Token-Prüfung fehlgeschlagen.') };
  }

  if (!response.ok) {
    return { error: fail(401, 'Ungültiger oder abgelaufener Login.') };
  }

  const user = await response.json();
  if (!user?.id) {
    return { error: fail(401, 'Ungültiger oder abgelaufener Login.') };
  }
  return { user };
}

function enforceRateLimit(action, subjectKey) {
  const limit = RATE_LIMITS[action];
  if (!limit || !subjectKey) return null;
  const now = Date.now();
  const bucketKey = `${action}:${subjectKey}`;
  const recent = (requestBuckets.get(bucketKey) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= limit) {
    return fail(429, 'Zu viele KI-Anfragen. Bitte warte kurz und versuche es erneut.');
  }
  recent.push(now);
  requestBuckets.set(bucketKey, recent);
  return null;
}

function estimateBase64Bytes(b64) {
  if (!b64 || typeof b64 !== 'string') return 0;
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return Math.floor((b64.length * 3) / 4) - padding;
}

function requireBase64Data(data, emptyMessage, tooLargeMessage) {
  if (!data || typeof data !== 'string') throw new Error(emptyMessage);
  if (estimateBase64Bytes(data) > MAX_INLINE_BYTES) {
    throw new Error(tooLargeMessage);
  }
}

function getModel(ai) {
  return ai.getGenerativeModel({ model: MODEL });
}

async function generateJson(ai, parts) {
  const result = await getModel(ai).generateContent(parts);
  const parsed = parseGeminiJson(result.response.text());
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Ungültiges Antwortformat der KI');
  }
  return parsed;
}

async function weatherInsight(ai, weatherData) {
  if (!weatherData || typeof weatherData !== 'object') {
    throw new Error('Ungültige Wetterdaten.');
  }

  const pollenText = weatherData.dominantPollen
    ? `Stärkste Pollenbelastung: ${weatherData.dominantPollen.name} (${weatherData.dominantPollen.value} grains/m³).`
    : 'Keine nennenswerte Pollenbelastung.';

  const prompt = `
Du bist ein erfahrener Imker-Experte aus der Schweiz.
Hier sind die aktuellen Wetter- und Trachtdaten direkt am Bienenstand:
- Temperatur: ${weatherData.temperature}°C
- Wetterlage: ${weatherData.conditionText}
- Windgeschwindigkeit: ${weatherData.windSpeed} km/h
- Pollen: ${pollenText}

Aufgabe:
Erkläre in maximal 2 kurzen Sätzen, was diese Situation konkret für das Verhalten der Bienen oder die Arbeit des Imkers bedeutet.
Formuliere praxisnah, motivierend und direkt (ohne Einleitung wie "Hallo").
  `;

  const result = await getModel(ai).generateContent(prompt);
  return { text: result.response.text().trim() };
}

async function parseAudio(ai, payload = {}) {
  requireBase64Data(
    payload.data,
    'Keine Audiodaten übermittelt.',
    'Audiodatei ist zu gross (max. 8 MB).'
  );

  const ALLOWED_AUDIO_TYPES = new Set([
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg', 'audio/mp3'
  ]);
  const audioMime = ALLOWED_AUDIO_TYPES.has(payload.mimeType) ? payload.mimeType : 'audio/webm';

  const parsed = await generateJson(ai, [
    { inlineData: { data: payload.data, mimeType: audioMime } },
    { text: AUDIO_PROMPT }
  ]);

  return {
    hiveNames: Array.isArray(parsed.hiveNames) ? parsed.hiveNames.map(String) : [],
    notes: typeof parsed.notes === 'string' ? parsed.notes : ''
  };
}

async function parseReceipt(ai, payload = {}) {
  requireBase64Data(
    payload.data,
    'Keine Bilddatei übermittelt.',
    'Beleg-Bild ist zu gross (max. 8 MB).'
  );
  const mimeType = payload.mimeType || '';
  if (mimeType && !ALLOWED_RECEIPT_TYPES.has(mimeType) && !mimeType.startsWith('image/')) {
    throw new Error('Bitte ein Bild als Beleg hochladen.');
  }

  const parsed = await generateJson(ai, [
    { inlineData: { data: payload.data, mimeType: mimeType || 'image/jpeg' } },
    { text: RECEIPT_PROMPT }
  ]);

  const price = Number(parsed.price);
  const today = new Date().toISOString().split('T')[0];
  const description =
    typeof parsed.description === 'string' ? parsed.description.trim() : '';

  return {
    date:
      typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : today,
    description: description || 'Unbekannter Beleg',
    category: ALLOWED_CATEGORIES.has(parsed.category) ? parsed.category : 'Sonstiges',
    price: Number.isFinite(price) ? price : 0
  };
}

async function hiveRecommendation(ai, payload = {}) {
  const { hive, inspections } = payload;
  
  if (!hive || typeof hive !== 'object') {
    throw new Error('Ungültige Volksdaten.');
  }
  
  if (!Array.isArray(inspections) || inspections.length === 0) {
    return { recommendation: 'Noch keine Durchsichten vorhanden. Erstelle eine erste Durchsicht, um Empfehlungen zu erhalten.' };
  }

  // Sortiere Durchsichten nach Datum (neueste zuerst)
  const sortedInspections = [...inspections].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );

  // Begrenze auf die letzten 10 Durchsichten für Performance
  const recentInspections = sortedInspections.slice(0, 10);

  // Bereite Volksinformationen auf
  const hiveInfo = `
Volk: ${hive.name}
Königin: ${hive.queenName || 'Unbekannt'} (${hive.queenYear || 'Jahr unbekannt'}, ${hive.queenColor || 'Farbe unbekannt'})
Rasse: ${hive.breed || 'Unbekannt'}
Status: ${hive.status || 'Unbekannt'}
Brutwaben: ${hive.broodFrames || 0}
Honigwaben HR1: ${hive.honeyFrames1 || 0}
Honigwaben HR2: ${hive.honeyFrames2 || 0}
Notizen: ${hive.notes || 'Keine'}
  `.trim();

  // Bereite Durchsichten auf
  const inspectionsSummary = recentInspections.map((insp, idx) => {
    return `
Durchsicht ${idx + 1} (${insp.date}):
- Fütterung: ${insp.feeding || 'Keine Angabe'}
- Varroa-Behandlung: ${insp.varroa || 'Keine Angabe'}
- Brutstatus: ${insp.broodStatus || 'Keine Angabe'}
- Honigraum: ${insp.honeySuper || 'Keine Angabe'}
- Sanftmut: ${insp.temperament || 'Keine Angabe'}/5
- Wetter: ${insp.weatherCondition || 'Unbekannt'}, ${insp.weatherTemp !== undefined && insp.weatherTemp !== null && insp.weatherTemp !== '' ? insp.weatherTemp + '°C' : 'Temp. unbekannt'}
- Notizen: ${insp.notes || 'Keine'}
    `.trim();
  }).join('\n\n');

  const prompt = `
Du bist ein erfahrener Schweizer Imker-Experte. Analysiere dieses Bienenvolk:

${hiveInfo}

LETZTE DURCHSICHTEN:
${inspectionsSummary}

Aufgabe:
Gib eine KURZE, PRÄGNANTE Empfehlung auf DEUTSCH (max. 4-5 Sätze) mit den wichtigsten nächsten Schritten.

WICHTIG:
- Antworte AUSSCHLIESSLICH auf Deutsch (Hochdeutsch mit Schweizer Imker-Begriffen)
- Maximal 4-5 Sätze insgesamt
- Fokus auf die 2-3 wichtigsten Aktionen
- Konkret und handlungsorientiert
- Berücksichtige die aktuelle Jahreszeit (heute: ${new Date().toLocaleDateString('de-CH')})

Beispiel-Format:
"Das Volk entwickelt sich stark/schwach. [Hauptbeobachtung in 1 Satz]. Nächste Schritte: [Konkrete Aktion 1], [Konkrete Aktion 2]. [Optional: Wichtiger Hinweis]."
  `;

  const result = await getModel(ai).generateContent(prompt);
  return { recommendation: result.response.text().trim() };
}

const ACTIONS = {
  weather_insight: (ai, body) => weatherInsight(ai, body.weatherData),
  parse_audio: (ai, body) => parseAudio(ai, body),
  parse_receipt: (ai, body) => parseReceipt(ai, body),
  hive_recommendation: (ai, body) => hiveRecommendation(ai, body)
};

/**
 * @param {{ action?: string } & Record<string, unknown>} body
 * @param {{ headers?: Record<string, string | string[] | undefined> }} context
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleGeminiRequest(body, context = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return fail(503, 'Gemini API ist serverseitig nicht konfiguriert (GEMINI_API_KEY).');
  }

  const action = body?.action;
  if (!action || typeof action !== 'string') {
    return fail(400, 'Aktion fehlt.');
  }

  const run = ACTIONS[action];
  if (!run) return fail(400, 'Unbekannte Aktion.');

  const headers = normalizeHeaders(context.headers);
  const auth = await authenticateRequest(headers);
  if (auth.error) return auth.error;

  const rateLimitError = enforceRateLimit(action, auth.user.id);
  if (rateLimitError) return rateLimitError;

  try {
    return ok(await run(new GoogleGenerativeAI(apiKey), body));
  } catch (err) {
    console.error('[geminiProxy]', err);
    const safeMessages = [
      'Keine Audiodaten übermittelt.',
      'Audiodatei ist zu gross (max. 8 MB).',
      'Keine Bilddatei übermittelt.',
      'Beleg-Bild ist zu gross (max. 8 MB).',
      'Bitte ein Bild als Beleg hochladen.',
      'Ungültige Wetterdaten.',
      'Ungültige Volksdaten.',
      'Ungültiges Antwortformat der KI'
    ];
    const msg = safeMessages.includes(err.message) ? err.message : 'KI-Anfrage fehlgeschlagen.';
    return fail(502, msg);
  }
}

/** Netlify-style JSON response helper. */
export function geminiLambdaResponse(statusCode, body) {
  return {
    statusCode,
    headers: GEMINI_JSON_HEADERS,
    body: body == null || body === '' ? '' : JSON.stringify(body)
  };
}
