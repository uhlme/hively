import { test as base, expect } from '@playwright/test';

/**
 * Force German UI for E2E — CI browsers often report en-US, which would
 * flip i18n away from the German strings the specs assert on.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('hively_locale', 'de');
      } catch {
        /* ignore */
      }
    });
    await use(page);
  }
});

export { expect };
