/**
 * User-facing bug reports: collect light diagnostics, open mailto,
 * and optionally emit a PostHog event (via caller).
 */

import { version as PACKAGE_VERSION } from '../package.json';

export const SUPPORT_EMAIL = 'hively.support@pm.me';
export const APP_VERSION = PACKAGE_VERSION || '0.0.0';

const MAX_MESSAGE_CHARS = 4000;
const MAX_ERROR_CHARS = 500;

/** @type {{ message: string, at: string } | null} */
let lastCapturedError = null;

/**
 * Remember the most recent uncaught error for inclusion in reports.
 * @param {unknown} error
 */
export function rememberError(error) {
  const message = formatErrorMessage(error);
  if (!message) return;
  lastCapturedError = {
    message: message.slice(0, MAX_ERROR_CHARS),
    at: new Date().toISOString()
  };
}

export function getLastCapturedError() {
  return lastCapturedError;
}

export function clearLastCapturedError() {
  lastCapturedError = null;
}

/**
 * @param {unknown} error
 */
export function formatErrorMessage(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) {
    const stack = error.stack ? `\n${error.stack}` : '';
    return `${error.message || error.name || 'Error'}${stack}`.trim();
  }
  try {
    return String(error);
  } catch {
    return 'Unbekannter Fehler';
  }
}

function detectPlatform() {
  try {
    if (typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.()) {
      return 'ios';
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)')?.matches) {
      return 'pwa';
    }
  } catch {
    /* ignore */
  }
  return 'web';
}

/**
 * @param {{ view?: string }} [opts]
 */
export function collectBugContext(opts = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const loc = typeof location !== 'undefined' ? location : null;
  return {
    appVersion: APP_VERSION,
    platform: detectPlatform(),
    view: opts.view || 'unknown',
    online: nav ? Boolean(nav.onLine) : null,
    userAgent: nav?.userAgent || '',
    url: loc?.href || '',
    timestamp: new Date().toISOString(),
    lastError: lastCapturedError
  };
}

/**
 * @param {{ message: string, replyEmail?: string, context: ReturnType<typeof collectBugContext> }} opts
 */
export function buildMailtoBody({ message, replyEmail = '', context }) {
  const trimmed = String(message || '').trim().slice(0, MAX_MESSAGE_CHARS);
  const lines = [
    trimmed,
    '',
    '--- Diagnose (automatisch) ---',
    replyEmail ? `Antwort an: ${replyEmail.trim()}` : null,
    `Version: ${context.appVersion}`,
    `Plattform: ${context.platform}`,
    `Ansicht: ${context.view}`,
    `Online: ${context.online == null ? '?' : context.online ? 'ja' : 'nein'}`,
    `Zeit: ${context.timestamp}`,
    context.lastError
      ? `Letzter Fehler (${context.lastError.at}): ${context.lastError.message}`
      : null,
    context.url ? `URL: ${context.url}` : null,
    context.userAgent ? `UA: ${context.userAgent.slice(0, 160)}` : null
  ].filter((line) => line != null && line !== '');

  return lines.join('\n');
}

/**
 * @param {{ message: string, replyEmail?: string, context: ReturnType<typeof collectBugContext> }} opts
 */
export function buildMailtoUrl(opts) {
  const subject = encodeURIComponent(`Hively Fehlerbericht v${opts.context.appVersion}`);
  const body = encodeURIComponent(buildMailtoBody(opts));
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}

/**
 * Open the system mail client with a prefilled bug report.
 * Falls back to copying nothing — caller should still show confirmation.
 * @param {string} mailtoUrl
 * @returns {boolean} whether an open was attempted
 */
export function openMailto(mailtoUrl) {
  if (!mailtoUrl || typeof mailtoUrl !== 'string' || !mailtoUrl.startsWith('mailto:')) {
    return false;
  }
  try {
    const anchor = document.createElement('a');
    anchor.href = mailtoUrl;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    try {
      window.location.href = mailtoUrl;
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Validate + build payload for UI submit.
 * @param {{ message: string, replyEmail?: string, view?: string }} input
 */
export function prepareBugReport(input) {
  const message = String(input?.message || '').trim();
  if (!message) {
    return { ok: false, error: 'Bitte beschreibe den Fehler kurz.' };
  }
  if (message.length < 8) {
    return { ok: false, error: 'Bitte etwas genauer beschreiben (mind. ein paar Wörter).' };
  }

  const replyEmail = String(input?.replyEmail || '').trim();
  if (replyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyEmail)) {
    return { ok: false, error: 'Bitte eine gültige E-Mail angeben oder das Feld leer lassen.' };
  }

  const context = collectBugContext({ view: input?.view });
  const mailtoUrl = buildMailtoUrl({ message, replyEmail, context });
  return {
    ok: true,
    message,
    replyEmail,
    context,
    mailtoUrl,
    analyticsProps: {
      platform: context.platform,
      view: context.view,
      online: context.online,
      app_version: context.appVersion,
      has_reply_email: Boolean(replyEmail),
      has_last_error: Boolean(context.lastError),
      message_length: message.length
    }
  };
}
