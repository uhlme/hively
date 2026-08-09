/**
 * Server-side Gemini proxy — keeps GEMINI_API_KEY off the client.
 * Shared by the Netlify function and the Vite dev middleware.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import { parseGeminiJson } from '../src/utils.js';
import { isBillingEnforced } from './billing.js';
import { assertUserOperationHasPro, getServiceSupabase } from './proGate.js';
import { buildCorsJsonHeaders } from './corsHeaders.js';
import {
  buildAudioPrompt,
  buildHiveRecommendationPrompt,
  buildReceiptPrompt,
  buildWeatherInsightPrompt,
  languageMeta,
  normalizeFinanceCategory,
  normalizePromptLocale
} from './i18n/promptLocale.js';

// gemini-2.5-flash is blocked for new API keys (404). Prefer stable Gemini 3.5 Flash.
const MODEL = 'gemini-3.5-flash';
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

/** Legacy DE labels still accepted from older clients / stored rows. */
const CATEGORY_ID_TO_LEGACY = {
  hardware: 'Hardware',
  feed: 'Futter',
  bees: 'Bienen',
  equipment: 'Imkereibedarf',
  other: 'Sonstiges'
};

/** Default CORS headers (localhost / APP_ORIGIN). Prefer buildCorsJsonHeaders(origin). */
export const GEMINI_JSON_HEADERS = buildCorsJsonHeaders('');

function getApiKey() {
  // Never fall back to VITE_* — that encourages shipping the key in the client bundle.
  return process.env.GEMINI_API_KEY || '';
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

function enforceRateLimitMemory(bucketKey, limit) {
  const now = Date.now();
  const recent = (requestBuckets.get(bucketKey) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= limit) {
    return fail(429, 'Zu viele KI-Anfragen. Bitte warte kurz und versuche es erneut.');
  }
  recent.push(now);
  requestBuckets.set(bucketKey, recent);
  return null;
}

/**
 * Durable rate limit via Supabase (service_role). Falls back to in-memory on misconfig / missing table.
 */
async function enforceRateLimitDurable(bucketKey, limit) {
  let supabase;
  try {
    supabase = getServiceSupabase();
  } catch {
    return null; // caller falls back to memory
  }

  const now = new Date();
  const windowCutoff = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  const { data, error } = await supabase
    .from('api_rate_limits')
    .select('bucket_key, window_start, hit_count')
    .eq('bucket_key', bucketKey)
    .maybeSingle();
  if (error) throw error;

  const windowStart = data?.window_start ? new Date(data.window_start) : null;
  const hitCount = Number(data?.hit_count) || 0;

  if (!windowStart || windowStart < windowCutoff) {
    const { error: upsertErr } = await supabase.from('api_rate_limits').upsert({
      bucket_key: bucketKey,
      window_start: now.toISOString(),
      hit_count: 1,
      updated_at: now.toISOString()
    });
    if (upsertErr) throw upsertErr;
    return { limited: false };
  }

  if (hitCount >= limit) {
    return {
      limited: true,
      response: fail(429, 'Zu viele KI-Anfragen. Bitte warte kurz und versuche es erneut.')
    };
  }

  const { error: updateErr } = await supabase
    .from('api_rate_limits')
    .update({ hit_count: hitCount + 1, updated_at: now.toISOString() })
    .eq('bucket_key', bucketKey);
  if (updateErr) throw updateErr;
  return { limited: false };
}

async function enforceRateLimit(action, subjectKey) {
  const limit = RATE_LIMITS[action];
  if (!limit || !subjectKey) return null;
  const bucketKey = `${action}:${subjectKey}`;

  try {
    const durable = await enforceRateLimitDurable(bucketKey, limit);
    if (durable?.limited) return durable.response;
    if (durable && durable.limited === false) return null;
  } catch (err) {
    console.warn('[geminiProxy] durable rate limit unavailable, using memory:', err.message || err);
  }

  return enforceRateLimitMemory(bucketKey, limit);
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

function getModel(ai, generationConfig = {}) {
  return ai.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      // Gemini 2.5 Flash may spend tokens on "thinking"; keep headroom for visible text.
      maxOutputTokens: 2048,
      ...generationConfig
    }
  });
}

/**
 * Safely read model text. `response.text()` throws when candidates are empty/blocked;
 * Gemini 2.5 may also leave the primary text empty while parts still hold content.
 */
export function extractGeminiText(response) {
  if (!response) return '';
  try {
    const direct = typeof response.text === 'function' ? response.text() : '';
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
  } catch {
    // fall through to candidates/parts
  }
  const parts = response?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

async function generateJson(ai, parts) {
  const result = await getModel(ai).generateContent(parts);
  const parsed = parseGeminiJson(extractGeminiText(result.response));
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Ungültiges Antwortformat der KI');
  }
  return parsed;
}

async function weatherInsight(ai, weatherData, locale) {
  if (!weatherData || typeof weatherData !== 'object') {
    throw new Error('Ungültige Wetterdaten.');
  }

  const prompt = buildWeatherInsightPrompt(locale, weatherData);
  const result = await getModel(ai, { maxOutputTokens: 1024 }).generateContent(prompt);
  const text = extractGeminiText(result.response);
  if (!text) throw new Error('Ungültiges Antwortformat der KI');
  return { text };
}

async function parseAudio(ai, payload = {}, locale = 'de') {
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
    { text: buildAudioPrompt(locale) }
  ]);

  return {
    hiveNames: Array.isArray(parsed.hiveNames) ? parsed.hiveNames.map(String) : [],
    notes: typeof parsed.notes === 'string' ? parsed.notes : ''
  };
}

async function parseReceipt(ai, payload = {}, locale = 'de') {
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
    { text: buildReceiptPrompt(locale) }
  ]);

  const price = Number(parsed.price);
  const today = new Date().toISOString().split('T')[0];
  const description =
    typeof parsed.description === 'string' ? parsed.description.trim() : '';
  const categoryId = normalizeFinanceCategory(parsed.category);

  return {
    date:
      typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
        ? parsed.date
        : today,
    description: description || 'Unbekannter Beleg',
    // Stable id for new clients + legacy DE label for existing finance forms.
    categoryId,
    category: CATEGORY_ID_TO_LEGACY[categoryId] || 'Sonstiges',
    price: Number.isFinite(price) ? price : 0
  };
}

async function hiveRecommendation(ai, payload = {}, locale = 'de') {
  const { hive, inspections } = payload;
  const loc = normalizePromptLocale(locale);
  const lang = languageMeta(loc);

  if (!hive || typeof hive !== 'object') {
    throw new Error('Ungültige Volksdaten.');
  }

  if (!Array.isArray(inspections) || inspections.length === 0) {
    return {
      recommendation:
        loc === 'fr'
          ? "Aucune visite pour l'instant. Crée une première visite pour obtenir des recommandations."
          : loc === 'it'
            ? 'Nessuna visita ancora. Crea una prima visita per ricevere raccomandazioni.'
            : loc === 'en'
              ? 'No inspections yet. Create a first inspection to get recommendations.'
              : 'Noch keine Durchsichten vorhanden. Erstelle eine erste Durchsicht, um Empfehlungen zu erhalten.'
    };
  }

  const sortedInspections = [...inspections].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
  const recentInspections = sortedInspections.slice(0, 10);

  const hiveInfo = `
Hive: ${hive.name}
Queen: ${hive.queenName || 'Unknown'} (${hive.queenYear || 'year unknown'}, ${hive.queenColor || 'color unknown'})
Breed: ${hive.breed || 'Unknown'}
Status: ${hive.status || 'Unknown'}
Brood frames: ${hive.broodFrames || 0}
Honey frames 1: ${hive.honeyFrames1 || 0}
Honey frames 2: ${hive.honeyFrames2 || 0}
Notes: ${hive.notes || 'None'}
  `.trim();

  const inspectionsSummary = recentInspections
    .map((insp, idx) => formatInspectionForPrompt(insp, idx + 1))
    .join('\n\n');

  const todayLabel = new Date().toLocaleDateString(lang.localeTag);
  const prompt = buildHiveRecommendationPrompt(loc, {
    hiveInfo,
    inspectionsSummary,
    todayLabel
  });

  const result = await getModel(ai, { maxOutputTokens: 4096 }).generateContent(prompt);
  const recommendation = extractGeminiText(result.response);
  if (!recommendation) throw new Error('Ungültiges Antwortformat der KI');
  return { recommendation };
}

/** @param {Record<string, unknown>|null|undefined} checklist */
export function formatChecklistForPrompt(checklist) {
  if (!checklist || typeof checklist !== 'object') return 'n/a';
  const bits = [];
  const keys = [
    'queenSeen',
    'eggs',
    'openBrood',
    'cappedBrood',
    'playCups',
    'queenCells',
    'strength',
    'varroaLevel'
  ];
  for (const key of keys) {
    const val = checklist[key];
    if (val !== undefined && val !== null && val !== '') {
      bits.push(`${key}=${val}`);
    }
  }
  return bits.length ? bits.join(', ') : 'n/a';
}

/** @param {Record<string, unknown>} insp @param {number} index */
export function formatInspectionForPrompt(insp, index) {
  const c = insp?.checklist;
  const varroa =
    insp?.varroa ||
    (c && typeof c === 'object' && c.varroaLevel ? `level:${c.varroaLevel}` : null) ||
    'n/a';
  const brood =
    insp?.broodStatus ||
    (c && typeof c === 'object' ? formatChecklistForPrompt(c) : null) ||
    'n/a';
  return `
Inspection ${index} (${insp?.date || 'unknown date'}):
- Feeding: ${insp?.feeding || 'n/a'}
- Varroa: ${varroa}
- Brood: ${brood}
- Checklist: ${formatChecklistForPrompt(c)}
- Honey super: ${insp?.honeySuper || 'n/a'}
- Temperament: ${insp?.temperament ?? 'n/a'}/5
- Weather: ${insp?.weatherCondition || 'unknown'}, ${
    insp?.weatherTemp !== undefined && insp?.weatherTemp !== null && insp?.weatherTemp !== ''
      ? `${insp.weatherTemp}°C`
      : 'temp n/a'
  }
- Notes: ${insp?.notes || 'None'}
  `.trim();
}

const ACTIONS = {
  weather_insight: (ai, body) =>
    weatherInsight(ai, body.weatherData, normalizePromptLocale(body.locale)),
  parse_audio: (ai, body) => parseAudio(ai, body, normalizePromptLocale(body.locale)),
  parse_receipt: (ai, body) => parseReceipt(ai, body, normalizePromptLocale(body.locale)),
  hive_recommendation: (ai, body) =>
    hiveRecommendation(ai, body, normalizePromptLocale(body.locale))
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

  if (isBillingEnforced()) {
    const operationId =
      typeof body?.operationId === 'string' ? body.operationId.trim() : '';
    const pro = await assertUserOperationHasPro(auth.user.id, operationId);
    if (!pro.ok) {
      return fail(pro.status || 402, pro.error || 'Hively Pro erforderlich.');
    }
  }

  const rateLimitError = await enforceRateLimit(action, auth.user.id);
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
export function geminiLambdaResponse(statusCode, body, requestOrigin = '') {
  return {
    statusCode,
    headers: buildCorsJsonHeaders(requestOrigin),
    body: body == null || body === '' ? '' : JSON.stringify(body)
  };
}
