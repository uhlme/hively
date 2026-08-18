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
});
