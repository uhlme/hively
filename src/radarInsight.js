/** Cached Bienen-Radar copy while Pro is locked (soft gate). */
export const PRO_UPSELL_INSIGHT = 'KI-Einschätzung ist Teil von Hively Pro.';

/** True when radar insight is still the Pro upsell placeholder. */
export function isProUpsellInsight(insight) {
  return String(insight || '').includes('Teil von Hively Pro');
}
