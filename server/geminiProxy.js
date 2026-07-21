/**
 * Server-side Gemini proxy — keeps GEMINI_API_KEY off the client.
 * Shared by the Netlify function and the Vite dev middleware.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseGeminiJson } from '../src/utils.js';

const MODEL = 'gemini-2.5-flash';
const MAX_INLINE_BYTES = 8 * 1024 * 1024;
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

function ok(body) {
  return { status: 200, body };
}

function fail(status, error) {
  return { status, body: { error } };
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

  const parsed = await generateJson(ai, [
    { inlineData: { data: payload.data, mimeType: payload.mimeType || 'audio/webm' } },
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

const ACTIONS = {
  weather_insight: (ai, body) => weatherInsight(ai, body.weatherData),
  parse_audio: (ai, body) => parseAudio(ai, body),
  parse_receipt: (ai, body) => parseReceipt(ai, body)
};

/**
 * @param {{ action?: string } & Record<string, unknown>} body
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleGeminiRequest(body) {
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

  try {
    return ok(await run(new GoogleGenerativeAI(apiKey), body));
  } catch (err) {
    console.error('[geminiProxy]', err);
    return fail(502, err.message || 'KI-Anfrage fehlgeschlagen.');
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
