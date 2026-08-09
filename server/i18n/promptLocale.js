/**
 * Locale helpers for Gemini prompts (server-side).
 * Keep JSON field names in English; localize free-text instructions.
 */

export const PROMPT_LOCALES = ['de', 'fr', 'it', 'en'];

export function normalizePromptLocale(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace('_', '-');
  if (PROMPT_LOCALES.includes(s)) return s;
  const base = s.split('-')[0];
  return PROMPT_LOCALES.includes(base) ? base : 'de';
}

const LANGUAGE = {
  de: {
    name: 'German (Swiss High German / Hochdeutsch)',
    short: 'German',
    localeTag: 'de-CH',
    dialectNote:
      'The audio is often spoken in Swiss German dialect (Mundart). Understand the dialect, normalize meaning, and write free-text fields in High German.'
  },
  fr: {
    name: 'French',
    short: 'French',
    localeTag: 'fr-CH',
    dialectNote:
      'The audio may be Swiss German dialect, French, or mixed. Understand the content and write free-text fields in French.'
  },
  it: {
    name: 'Italian',
    short: 'Italian',
    localeTag: 'it-CH',
    dialectNote:
      'The audio may be Swiss German dialect, Italian, or mixed. Understand the content and write free-text fields in Italian.'
  },
  en: {
    name: 'English',
    short: 'English',
    localeTag: 'en-CH',
    dialectNote:
      'The audio may be Swiss German dialect or another language. Understand the content and write free-text fields in English.'
  }
};

export function languageMeta(locale) {
  return LANGUAGE[normalizePromptLocale(locale)] || LANGUAGE.de;
}

export function buildAudioPrompt(locale) {
  const loc = normalizePromptLocale(locale);
  const lang = languageMeta(loc);
  return `You are an AI that analyzes spoken beekeeping inspection notes.
Listen carefully to the attached audio.
${lang.dialectNote}
Return a structured JSON object only.

JSON format:
{
  "hiveNames": ["Array of recognized hive names, e.g. ['Hive 1']. If the user says 'all' / 'alle' / 'tous' / 'tutti', return ['alle']. Empty array [] if none named."],
  "notes": "A clear, structured summary of the full inspection in ${lang.name}. Include brood, honey supers, temperament, feeding, varroa treatment and other work when mentioned."
}

Rules:
- Reply with the JSON object ONLY (no markdown fences).
- Unmentioned fields → empty array or null.
- Free-text "notes" MUST be written in ${lang.short}.`;
}

export function buildReceiptPrompt(locale) {
  const loc = normalizePromptLocale(locale);
  const lang = languageMeta(loc);
  return `You are a receipt scanner for a beekeeping app.
Analyze the attached receipt/invoice image.
Extract data as JSON. Free-text "description" MUST be in ${lang.short}.

Return:
- date: YYYY-MM-DD (use today's date if missing)
- description: short summary of main items in ${lang.short}
- category: exactly one of: "hardware", "feed", "bees", "equipment", "other"
  (map German labels Hardware/Futter/Bienen/Imkereibedarf/Sonstiges to these ids if printed that way)
- price: total amount as decimal number only (no currency symbol)

JSON format:
{
  "date": "YYYY-MM-DD",
  "description": "item summary",
  "category": "hardware",
  "price": 129.50
}

Rules:
- JSON only, no markdown.
- category must be one of the ids above.`;
}

export function buildWeatherInsightPrompt(locale, weatherData) {
  const loc = normalizePromptLocale(locale);
  const lang = languageMeta(loc);
  const pollenText = weatherData.dominantPollen
    ? `Strongest pollen: ${weatherData.dominantPollen.name} (${weatherData.dominantPollen.value} grains/m³).`
    : 'No significant pollen load.';

  return `You are an experienced beekeeping expert in Switzerland.
Current weather at the apiary:
- Temperature: ${weatherData.temperature}°C
- Conditions: ${weatherData.conditionText}
- Wind: ${weatherData.windSpeed} km/h
- Pollen: ${pollenText}

Task:
In at most 2 short sentences, explain what this means for bee behaviour or the beekeeper's work.
Practical, motivating, direct (no greeting).

Language (strict):
- Write the entire answer in ${lang.name} only.
- Do not use German, French, Italian, or English unless that is ${lang.short}.
- Even if weather/pollen labels above look like another language, still answer only in ${lang.short}.`;
}

export function buildHiveRecommendationPrompt(locale, { hiveInfo, inspectionsSummary, todayLabel }) {
  const loc = normalizePromptLocale(locale);
  const lang = languageMeta(loc);
  return `You are an experienced Swiss beekeeping expert. Analyze this colony:

${hiveInfo}

RECENT INSPECTIONS:
${inspectionsSummary}

Task:
Give a SHORT recommendation in ${lang.name} (max 4–5 sentences) with the most important next steps.

Rules:
- Write the entire recommendation in ${lang.name} only
- Do not mix in other languages
- Max 4–5 sentences total
- Focus on 2–3 concrete actions
- Consider the current season (today: ${todayLabel})
- Use local beekeeping terminology appropriate for ${lang.short}`;
}

/** Map model category (id or legacy DE label) → stable id. */
export function normalizeFinanceCategory(raw) {
  const s = String(raw || '').trim();
  const lower = s.toLowerCase();
  const map = {
    hardware: 'hardware',
    feed: 'feed',
    bees: 'bees',
    equipment: 'equipment',
    other: 'other',
    futter: 'feed',
    bienen: 'bees',
    imkereibedarf: 'equipment',
    sonstiges: 'other',
    'hardware / beuten': 'hardware',
    'bienen / königinnen': 'bees',
    'imkereibedarf / werkzeug': 'equipment'
  };
  if (map[lower]) return map[lower];
  if (s === 'Hardware') return 'hardware';
  if (s === 'Futter') return 'feed';
  if (s === 'Bienen') return 'bees';
  if (s === 'Imkereibedarf') return 'equipment';
  if (s === 'Sonstiges') return 'other';
  return 'other';
}
