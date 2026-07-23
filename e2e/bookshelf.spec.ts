import { expect, test } from '@playwright/test';

const readerCredentials = {
  email: 'e2e-reader@novel.local',
  password: 'E2EReader123456',
};

test('reader can add and remove a novel from the bookshelf', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(readerCredentials.email);
  await page.locator('input[type="password"]').fill(readerCredentials.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/novels/seed_novel_star_pact');
  const bookshelfButton = page.locator('.action-row > button').first();
  await expect(bookshelfButton).toContainText('\u52a0\u5165\u4e66\u67b6');

  await bookshelfButton.click();
  await expect(bookshelfButton).toContainText('\u79fb\u51fa\u4e66\u67b6');

  await page.goto('/bookshelf');
  const bookshelfItem = page
    .locator('.bookshelf-row')
    .filter({ has: page.locator('a[href="/novels/seed_novel_star_pact"]') });
  await expect(bookshelfItem).toBeVisible();

  const removeButton = bookshelfItem.locator('button.remove-button');
  await removeButton.click();
  await expect(removeButton).toHaveAttribute('aria-label', '\u786e\u8ba4\u79fb\u51fa\u4e66\u67b6');
  await removeButton.click();
  await expect(bookshelfItem).toHaveCount(0);
});
