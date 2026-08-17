import { expect, test } from '@playwright/test';

test('novel detail keeps catalog, discussion, and rating in separate views', async ({ page }) => {
  await page.goto('/novels/seed_novel_star_pact');

  const workspaceTabs = page.locator('.detail-workspace-tabs');
  await expect(workspaceTabs).toBeVisible();
  await expect(workspaceTabs.getByRole('button')).toHaveCount(3);
  await expect(workspaceTabs.getByRole('button', { name: '\u76ee\u5f55' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('.chapter-volume-groups')).toBeVisible();
  await expect(page.locator('.novel-rating-panel')).toBeHidden();

  await workspaceTabs.getByRole('button', { name: '\u8ba8\u8bba' }).click();
  await expect(page.locator('.comment-form')).toBeVisible();
  await expect(page.locator('.chapter-volume-groups')).toBeHidden();

  await workspaceTabs.getByRole('button', { name: '\u8bc4\u5206' }).click();
  await expect(page.locator('.novel-rating-panel')).toBeVisible();
  await expect(page.locator('.comment-form')).toBeHidden();
});
