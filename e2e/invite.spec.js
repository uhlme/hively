import { devices } from '@playwright/test';
import { test, expect } from './fixtures.js';

test.describe('Invite landing page', () => {
  test('desktop continues into the app with the join code', async ({ page }) => {
    await page.goto('/join.html?join=ABCD2345');
    await expect(page).toHaveURL(/[?&]join=ABCD2345/);
    await expect(page).not.toHaveURL(/join\.html/);
    await expect(page).toHaveTitle(/Hively/);
  });

  test('missing code stays on the landing page', async ({ page }) => {
    await page.goto('/join.html');
    await expect(page.getByRole('heading', { name: 'Hively' })).toBeVisible();
    await expect(page.getByText('Kein gültiger Einladungscode.')).toBeVisible();
  });

  test('mobile offers native app deep link and browser fallback', async ({ browser }) => {
    const context = await browser.newContext({
      ...devices['iPhone 14'],
      locale: 'de-CH'
    });
    const page = await context.newPage();
    await page.clock.install();
    await page.goto('/join.html?join=BAADMGB34UUA');
    await expect(page.getByRole('heading', { name: 'Betrieb beitreten' })).toBeVisible();
    await expect(page.getByText('BAADMGB34UUA')).toBeVisible();
    await expect(page.getByRole('link', { name: 'In der App öffnen' })).toHaveAttribute(
      'href',
      'ch.hively.app://join?join=BAADMGB34UUA'
    );
    await expect(page.getByRole('link', { name: 'Im Browser beitreten' })).toHaveAttribute(
      'href',
      '/?join=BAADMGB34UUA'
    );
    await context.close();
  });
});
