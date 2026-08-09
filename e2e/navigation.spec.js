import { test, expect } from './fixtures.js';

/**
 * Android hardware Back uses window.history (Capacitor default).
 * Nested hive-detail must pushState so Back leaves the detail view
 * instead of exiting the WebView — including viewers who open a hive
 * from a Dashboard «Durchsicht» card.
 */
test.describe('Hive detail back navigation', () => {
  async function createHive(page, name) {
    await page.locator('.nav-item[data-view="hives"]').click();
    await expect(page.locator('#view-hives')).toBeVisible();
    await page.locator('#btn-quick-add').click();
    await expect(page.locator('#modal-hive')).toHaveClass(/active/);
    await page.locator('#hive-form-name').fill(name);
    await page.locator('#hive-form-status').selectOption('Gesund');
    await page.locator('#form-hive button[type="submit"]').click();
    await expect(page.locator('#modal-hive')).not.toHaveClass(/active/);
    await expect(page.getByText(name)).toBeVisible();
  }

  test('browser back from hive detail returns to Kästen without leaving the app', async ({ page }) => {
    const hiveName = `Back Nav Volk ${Date.now()}`;
    await page.goto('/');
    await createHive(page, hiveName);

    await page.locator('.hive-card', { hasText: hiveName }).click();
    await expect(page.locator('#view-hive-detail')).toBeVisible();
    await expect(page.locator('#view-hive-detail')).not.toHaveClass(/hidden/);
    await expect(page.locator('#detail-hive-title')).toHaveText(hiveName);

    await page.goBack();

    await expect(page.locator('#view-hives')).toBeVisible();
    await expect(page.locator('#view-hives')).not.toHaveClass(/hidden/);
    await expect(page.locator('#view-hive-detail')).toHaveClass(/hidden/);
    await expect(page.getByText(hiveName)).toBeVisible();
    await expect(page).toHaveURL(/localhost:5173/);
  });

  test('UI Zurück uses history and returns to the previous screen', async ({ page }) => {
    const hiveName = `UI Back Volk ${Date.now()}`;
    await page.goto('/');
    await expect(page.locator('#view-dashboard')).toBeVisible();

    await createHive(page, hiveName);
    // Return to dashboard, then open detail via Kästen so history has a prior entry
    await page.locator('.nav-item[data-view="dashboard"]').click();
    await expect(page.locator('#view-dashboard')).toBeVisible();
    await page.locator('.nav-item[data-view="hives"]').click();
    await page.locator('.hive-card', { hasText: hiveName }).click();
    await expect(page.locator('#view-hive-detail')).toBeVisible();

    await page.locator('#btn-back-to-hives').click();

    await expect(page.locator('#view-hives')).toBeVisible();
    await expect(page.locator('#view-hive-detail')).toHaveClass(/hidden/);
    await expect(page.getByText(hiveName)).toBeVisible();
  });

  test('viewer-style Dashboard Durchsicht opens hive detail and back returns to Dashboard', async ({ page }) => {
    const hiveName = `Viewer Durchsicht ${Date.now()}`;
    await page.goto('/');
    await createHive(page, hiveName);

    // Seed an inspection linked to the hive (same path viewers open from Dashboard)
    const hiveId = await page.locator('.hive-card', { hasText: hiveName }).getAttribute('data-id');
    await page.evaluate(({ hiveId: id }) => {
      const key = 'bee_tracker_inspections';
      const inspections = JSON.parse(localStorage.getItem(key) || '[]');
      inspections.push({
        id: `insp_e2e_${Date.now()}`,
        hiveId: id,
        date: '2026-08-06',
        notes: 'Fütterung',
        checklist: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      localStorage.setItem(key, JSON.stringify(inspections));
    }, { hiveId });

    // Force Betrachter behaviour for activity cards (local mode has no Supabase role)
    await page.addInitScript(() => {
      window.__HIVELY_E2E_FORCE_VIEWER__ = true;
    });
    await page.reload();
    await expect(page.locator('#view-dashboard')).toBeVisible();

    const activity = page.locator('.recent-activity-card', { hasText: hiveName }).first();
    await expect(activity).toBeVisible();
    await activity.click();

    await expect(page.locator('#view-hive-detail')).toBeVisible();
    await expect(page.locator('#detail-hive-title')).toHaveText(hiveName);

    // Simulates Android hardware Back (Capacitor → history.back)
    await page.goBack();

    await expect(page.locator('#view-dashboard')).toBeVisible();
    await expect(page.locator('#view-hive-detail')).toHaveClass(/hidden/);
    await expect(page.locator('.recent-activity-card', { hasText: hiveName }).first()).toBeVisible();
  });
});
