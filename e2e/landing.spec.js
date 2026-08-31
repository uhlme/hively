import { test, expect } from './fixtures.js';

test.describe('Start landing page', () => {
  test('shows official App Store and Google Play badges', async ({ page }) => {
    await page.goto('/start/');

    const appStore = page.locator('#cta-app-store');
    const playStore = page.locator('#cta-play-store');

    await expect(appStore).toBeVisible();
    await expect(playStore).toBeVisible();
    await expect(appStore).toHaveAttribute(
      'href',
      /apps\.apple\.com\/ch\/app\/hively-bienen-tracker\/id6796405767/
    );
    await expect(playStore).toHaveAttribute(
      'href',
      /play\.google\.com\/store\/apps\/details\?id=ch\.hively\.app/
    );

    const appleImg = appStore.locator('img');
    const playImg = playStore.locator('img');
    await expect(appleImg).toHaveAttribute('alt', 'Laden im App Store');
    await expect(playImg).toHaveAttribute('alt', 'Jetzt bei Google Play');

    const appleBox = await appleImg.boundingBox();
    const playBox = await playImg.boundingBox();
    expect(appleBox?.height).toBeGreaterThanOrEqual(40);
    expect(playBox?.height).toBeGreaterThanOrEqual(28);

    const appleFirst = await page.locator('.store-badge').first().getAttribute('id');
    expect(appleFirst).toBe('cta-app-store');
  });
});
