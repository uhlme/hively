import { test, expect } from './fixtures.js';

test.describe('Hive form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-item[data-view="hives"]').click();
    await page.locator('#btn-quick-add').click();
    await expect(page.locator('#modal-hive')).toHaveClass(/active/);
  });

  test('empty submit is blocked by HTML required validation', async ({ page }) => {
    const nameInput = page.locator('#hive-form-name');
    await page.locator('#form-hive button[type="submit"]').click();
    // Native HTML5 validation keeps the modal open and focuses the required field
    await expect(nameInput).toBeFocused();
    await expect(page.locator('#modal-hive')).toHaveClass(/active/);
  });

  test('valid submit creates a hive and persists after reload', async ({ page }) => {
    const hiveName = `E2E Volk ${Date.now()}`;
    await page.locator('#hive-form-name').fill(hiveName);
    await page.locator('#hive-form-queen-name').fill('Maya');
    await page.locator('#hive-form-breed').fill('Carnica');
    await page.locator('#hive-form-status').selectOption('Gesund');
    await page.locator('#form-hive button[type="submit"]').click();

    await expect(page.locator('#modal-hive')).not.toHaveClass(/active/);
    await expect(page.getByText(hiveName)).toBeVisible();

    await page.reload();
    await page.locator('.nav-item[data-view="hives"]').click();
    await expect(page.getByText(hiveName)).toBeVisible();
  });

  test('dashboard activities show Kastenbezeichnung and Königinnenname', async ({ page }) => {
    const hiveName = `Kasten 7 ${Date.now()}`;
    const queenName = 'Brummhilde';
    await page.locator('#hive-form-name').fill(hiveName);
    await page.locator('#hive-form-queen-name').fill(queenName);
    await page.locator('#hive-form-status').selectOption('Gesund');
    await page.locator('#form-hive button[type="submit"]').click();
    await expect(page.locator('#modal-hive')).not.toHaveClass(/active/);

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

    await page.locator('.nav-item[data-view="dashboard"]').click();
    await expect(page.locator('#view-dashboard')).toBeVisible();
    await expect(
      page.locator('.recent-activity-card', { hasText: `${hiveName} - ${queenName}` })
    ).toBeVisible();
  });
});

test.describe('Finance form', () => {
  test('empty submit is blocked by required fields', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-item[data-view="finances"]').click();
    await expect(page.locator('#btn-quick-add')).toHaveText('+');
    await expect(page.locator('#btn-quick-add')).toHaveAttribute('aria-label', '+ Kauf');
    await page.locator('#btn-quick-add').click();
    await expect(page.locator('#modal-finance')).toHaveClass(/active/);

    await page.locator('#finance-form-date').fill('');
    await page.locator('#finance-form-description').fill('');
    await page.locator('#finance-form-price').fill('');
    await page.locator('#form-finance button[type="submit"]').click();
    await expect(page.locator('#modal-finance')).toHaveClass(/active/);
  });

  test('valid expense is saved and listed', async ({ page }) => {
    await page.goto('/');
    await page.locator('.nav-item[data-view="finances"]').click();
    await page.locator('#btn-quick-add').click();
    await expect(page.locator('#modal-finance')).toHaveClass(/active/);

    const description = `E2E Absperrgitter ${Date.now()}`;
    await page.locator('#finance-form-date').fill('2026-08-01');
    await page.locator('#finance-form-description').fill(description);
    await page.locator('#finance-form-category').selectOption('hardware');
    await page.locator('#finance-form-price').fill('42.50');
    await page.locator('#form-finance button[type="submit"]').click();

    await expect(page.locator('#modal-finance')).not.toHaveClass(/active/);
    await expect(page.getByText(description)).toBeVisible();
  });
});

test.describe('Auth form (local mode)', () => {
  test('empty login submit is blocked by required fields', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.getElementById('modal-auth')?.classList.add('active');
    });
    await expect(page.locator('#modal-auth')).toHaveClass(/active/);
    await page.locator('#auth-email').fill('');
    await page.locator('#auth-password').fill('');
    await page.locator('#form-auth button[type="submit"]').click();
    await expect(page.locator('#auth-email')).toBeFocused();
  });

  test('invalid email is rejected by HTML validation', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      document.getElementById('modal-auth')?.classList.add('active');
    });
    await page.locator('#auth-email').fill('notanemail');
    await page.locator('#auth-password').fill('secret123');
    await page.locator('#form-auth button[type="submit"]').click();
    await expect(page.locator('#modal-auth')).toHaveClass(/active/);
    const valid = await page.locator('#auth-email').evaluate((el) => el.checkValidity());
    expect(valid).toBe(false);
  });
});

test.describe('Honey harvest form', () => {
  test('valid harvest is saved', async ({ page }) => {
    await page.goto('/');

    // Create a hive first (no demo seed)
    await page.locator('.nav-item[data-view="hives"]').click();
    await page.locator('#btn-quick-add').click();
    await expect(page.locator('#modal-hive')).toHaveClass(/active/);
    const hiveName = `E2E Honigvolk ${Date.now()}`;
    await page.locator('#hive-form-name').fill(hiveName);
    await page.locator('#form-hive button[type="submit"]').click();
    await expect(page.locator('#modal-hive')).not.toHaveClass(/active/);

    await page.locator('.nav-item[data-view="finances"]').click();
    await page.locator('#tab-fin-honey').click();
    await page.locator('#btn-add-honey').click();
    await expect(page.locator('#modal-honey')).toHaveClass(/active/);

    const hiveSelect = page.locator('#honey-form-hive-id');
    await hiveSelect.selectOption({ label: hiveName });
    await page.locator('#honey-form-date').fill('2026-07-15');
    await page.locator('#honey-form-amount').fill('12.5');
    await page.locator('#honey-form-type').fill('E2E Frühtracht');
    await page.locator('#form-honey button[type="submit"]').click();

    await expect(page.locator('#modal-honey')).not.toHaveClass(/active/);
    await expect(page.locator('#section-honey').getByText('E2E Frühtracht').first()).toBeVisible();
  });
});
