import { SUPPORTED_LOCALES, t } from './i18n/index.js';

/** Cached Bienen-Radar copy while Pro is locked (soft gate). */
export function getProUpsellInsight() {
  return t('ai.upsellInsight');
}

/** @deprecated use getProUpsellInsight() — kept for older caches */
export const PRO_UPSELL_INSIGHT = 'KI-Einschätzung ist Teil von Hively Pro.';

/** True when radar insight is still the Pro upsell placeholder (any locale). */
export function isProUpsellInsight(insight) {
  const s = String(insight || '').trim();
  if (!s) return false;
  if (s.includes('Teil von Hively Pro')) return true;
  return SUPPORTED_LOCALES.some((loc) => s === t('ai.upsellInsight', {}, loc));
}
