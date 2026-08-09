import { test, expect } from './fixtures.js';

test.describe('Hively smoke', () => {
  test('homepage loads with dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Hively/);
    await expect(page.locator('#view-dashboard .stat-label', { hasText: 'Völker' })).toBeVisible();
    await expect(page.locator('#view-dashboard')).toBeVisible();
  });

  test('bottom navigation switches views', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-item[data-view="hives"]').click();
    await expect(page.locator('#view-hives')).toBeVisible();
    await expect(page.locator('#view-hives .section-title')).toHaveText('Bienenstände');

    await page.locator('.nav-item[data-view="finances"]').click();
    await expect(page.locator('#view-finances')).toBeVisible();

    await page.locator('.nav-item[data-view="calendar"]').click();
    await expect(page.locator('#view-calendar')).toBeVisible();
  });
});
