/**
 * Shared helpers for escaping, safe storage reads, Gemini JSON parsing,
 * and button loading states.
 */

/**
 * Show/hide a loading spinner on a button while an async action runs.
 * Restores the original label when loading ends.
 */
export function setButtonLoading(button, isLoading, loadingLabel = 'Speichern…') {
  if (!button) return;

  if (isLoading) {
    if (button.dataset.loading === '1') return;
    button.dataset.loading = '1';
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.classList.add('is-loading');
    button.setAttribute('aria-busy', 'true');
    button.innerHTML =
      `<span class="btn-spinner" aria-hidden="true"></span>` +
      `<span class="btn-loading-label">${loadingLabel}</span>`;
    return;
  }

  if (button.dataset.loading !== '1') return;
  button.disabled = false;
  button.classList.remove('is-loading');
  button.removeAttribute('aria-busy');
  if (button.dataset.originalHtml !== undefined) {
    button.innerHTML = button.dataset.originalHtml;
  }
  delete button.dataset.originalHtml;
  delete button.dataset.loading;
}

/** Run an async fn while the button shows a spinner; always restores afterwards. */
export async function withButtonLoading(button, asyncFn, loadingLabel = 'Speichern…') {
  setButtonLoading(button, true, loadingLabel);
  try {
    return await asyncFn();
  } finally {
    setButtonLoading(button, false);
  }
}

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
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) text = fenced[1].trim();

  try {
    return JSON.parse(text);
  } catch {
    const starts = [text.indexOf('{'), text.indexOf('[')].filter((i) => i >= 0);
    if (starts.length === 0) throw new Error('Kein JSON in der KI-Antwort gefunden');

    const start = Math.min(...starts);
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    if (end <= start) throw new Error('Unvollständiges JSON in der KI-Antwort');

    return JSON.parse(text.slice(start, end + 1));
  }
}

/** Convert a Blob/File to a raw base64 string (without data-URL prefix). */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
