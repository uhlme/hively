/**
 * Server-side Gemini proxy — keeps GEMINI_API_KEY off the client.
 * Shared by the Netlify function and the Vite dev middleware.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = 'gemini-2.5-flash';
const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
];
const ALLOWED_CATEGORIES = ['Hardware', 'Futter', 'Bienen', 'Imkereibedarf', 'Sonstiges'];

function getApiKey() {
  return process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
}

function parseGeminiJson(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    throw new Error('Leere KI-Antwort');
  }

  let text = responseText.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) text = fenced[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    const startObj = text.indexOf('{');
    const startArr = text.indexOf('[');
    let start = -1;
    if (startObj === -1) start = startArr;
    else if (startArr === -1) start = startObj;
    else start = Math.min(startObj, startArr);
    if (start === -1) throw new Error('Kein JSON in der KI-Antwort gefunden');

    const endObj = text.lastIndexOf('}');
    const endArr = text.lastIndexOf(']');
    const end = Math.max(endObj, endArr);
    if (end <= start) throw new Error('Unvollständiges JSON in der KI-Antwort');
    return JSON.parse(text.slice(start, end + 1));
  }
}

function estimateBase64Bytes(b64) {
  if (!b64 || typeof b64 !== 'string') return 0;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

async function weatherInsight(ai, weatherData) {
  if (!weatherData || typeof weatherData !== 'object') {
    throw new Error('Ungültige Wetterdaten.');
  }

  const model = ai.getGenerativeModel({ model: MODEL });
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

  const result = await model.generateContent(prompt);
  return { text: result.response.text().trim() };
}

async function parseAudio(ai, payload) {
  const { data, mimeType } = payload || {};
  if (!data || typeof data !== 'string') throw new Error('Keine Audiodaten übermittelt.');
  if (estimateBase64Bytes(data) > MAX_INLINE_BYTES) {
    throw new Error('Audiodatei ist zu gross (max. 8 MB).');
  }

  const model = ai.getGenerativeModel({ model: MODEL });
  const systemPrompt = `Du bist eine KI zur Analyse von gesprochenen Imker-Protokollen bei einer Durchsicht von Bienenvölkern.
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

  const result = await model.generateContent([
    { inlineData: { data, mimeType: mimeType || 'audio/webm' } },
    { text: systemPrompt }
  ]);

  const parsed = parseGeminiJson(result.response.text());
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Ungültiges Antwortformat der KI');
  }

  return {
    hiveNames: Array.isArray(parsed.hiveNames) ? parsed.hiveNames.map(String) : [],
    notes: typeof parsed.notes === 'string' ? parsed.notes : ''
  };
}

async function parseReceipt(ai, payload) {
  const { data, mimeType } = payload || {};
  if (!data || typeof data !== 'string') throw new Error('Keine Bilddatei übermittelt.');
  if (estimateBase64Bytes(data) > MAX_INLINE_BYTES) {
    throw new Error('Beleg-Bild ist zu gross (max. 8 MB).');
  }
  if (mimeType && !ALLOWED_RECEIPT_TYPES.includes(mimeType) && !String(mimeType).startsWith('image/')) {
    throw new Error('Bitte ein Bild als Beleg hochladen.');
  }

  const model = ai.getGenerativeModel({ model: MODEL });
  const systemPrompt = `Du bist ein Beleg-Scanner für eine Imker-App.
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

  const result = await model.generateContent([
    { inlineData: { data, mimeType: mimeType || 'image/jpeg' } },
    { text: systemPrompt }
  ]);

  const parsed = parseGeminiJson(result.response.text());
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Ungültiges Antwortformat der KI');
  }

  const category = ALLOWED_CATEGORIES.includes(parsed.category)
    ? parsed.category
    : 'Sonstiges';
  const price = Number(parsed.price);
  const today = new Date().toISOString().split('T')[0];

  return {
    date:
      typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : today,
    description:
      typeof parsed.description === 'string' && parsed.description.trim()
        ? parsed.description.trim()
        : 'Unbekannter Beleg',
    category,
    price: Number.isFinite(price) ? price : 0
  };
}

/**
 * @param {{ action: string } & Record<string, unknown>} body
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleGeminiRequest(body) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      status: 503,
      body: { error: 'Gemini API ist serverseitig nicht konfiguriert (GEMINI_API_KEY).' }
    };
  }

  const action = body?.action;
  if (!action || typeof action !== 'string') {
    return { status: 400, body: { error: 'Aktion fehlt.' } };
  }

  const ai = new GoogleGenerativeAI(apiKey);

  try {
    if (action === 'weather_insight') {
      const result = await weatherInsight(ai, body.weatherData);
      return { status: 200, body: result };
    }
    if (action === 'parse_audio') {
      const result = await parseAudio(ai, body);
      return { status: 200, body: result };
    }
    if (action === 'parse_receipt') {
      const result = await parseReceipt(ai, body);
      return { status: 200, body: result };
    }
    return { status: 400, body: { error: 'Unbekannte Aktion.' } };
  } catch (err) {
    console.error('[geminiProxy]', err);
    return {
      status: 502,
      body: { error: err.message || 'KI-Anfrage fehlgeschlagen.' }
    };
  }
}

export const GEMINI_JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};
