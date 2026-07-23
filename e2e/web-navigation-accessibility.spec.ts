import { expect, test } from '@playwright/test';

test.describe('compact navigation and keyboard focus', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps every primary navigation destination reachable on a small viewport', async ({ page }) => {
    await page.goto('/');

    const navigation = page.getByRole('navigation');
    await expect(navigation).toBeVisible();
    await expect(navigation.locator('a')).toHaveCount(7);
    await expect(navigation.locator('a[href="/rankings"]')).toBeVisible();

    await navigation.locator('a[href="/rankings"]').click();
    await expect(page).toHaveURL(/\/rankings$/);
    await expect(page.getByRole('main')).toBeFocused();

    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(pageWidth).toBeLessThanOrEqual(viewportWidth);
  });

  test('moves keyboard users directly to the main content landmark', async ({ page }) => {
    await page.goto('/');

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  });

  test('returns focus to the reader catalog trigger after closing the dialog', async ({ page }) => {
    await page.goto('/novels/seed_novel_star_pact');

    const chapterLink = page.locator('a[href^="/chapters/"]').first();
    await expect(chapterLink).toBeVisible();
    await chapterLink.click();

    const catalogTrigger = page.locator('button[aria-controls="reader-catalog"]');
    await expect(catalogTrigger).toBeVisible();
    await catalogTrigger.click();

    const catalogDialog = page.getByRole('dialog');
    await expect(catalogDialog).toBeVisible();
    await expect(catalogDialog.locator('input')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(catalogDialog).not.toBeVisible();
    await expect(catalogTrigger).toBeFocused();
  });
});
