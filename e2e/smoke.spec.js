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
    await expect(page.locator('#btn-quick-add')).toBeVisible();
    await expect(page.locator('#btn-quick-add')).toHaveClass(/fab-quick-add/);
    await expect(page.locator('#btn-quick-add')).toHaveText('+');
    await expect(page.locator('#btn-quick-add')).toHaveAttribute('aria-label', '+ Volk');
    await expect(page.locator('body')).toHaveClass(/has-fab/);

    await page.locator('.nav-item[data-view="finances"]').click();
    await expect(page.locator('#view-finances')).toBeVisible();
    await expect(page.locator('#btn-quick-add')).toHaveText('+');
    await expect(page.locator('#btn-quick-add')).toHaveAttribute('aria-label', '+ Kauf');
    await expect(page.locator('body')).toHaveClass(/has-fab/);

    await page.locator('.nav-item[data-view="calendar"]').click();
    await expect(page.locator('#view-calendar')).toBeVisible();
    await expect(page.locator('#btn-quick-add')).toHaveClass(/hidden/);
    await expect(page.locator('body')).not.toHaveClass(/has-fab/);
  });
});
