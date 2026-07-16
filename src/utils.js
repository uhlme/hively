/**
 * Shared helpers for escaping, safe storage reads, and Gemini JSON parsing.
 */

/** Escape text for safe interpolation into HTML. */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sanitize a status string for use as a CSS class fragment. */
export function statusToCssClass(status) {
  return String(status || '')
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '');
}

/** Safely parse JSON from localStorage; return fallback on failure. */
export function safeJsonParse(raw, fallback = null) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Parse Gemini responses that may include markdown fences or surrounding text.
 */
export function parseGeminiJson(responseText) {
  if (!responseText || typeof responseText !== 'string') {
    throw new Error('Leere KI-Antwort');
  }

  let text = responseText.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    text = fenced[1].trim();
  }

  try {
    return JSON.parse(text);
  } catch {
    // Fall back to first JSON object/array substring
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
