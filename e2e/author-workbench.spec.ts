import { expect, test } from '@playwright/test';

const authorCredentials = {
  email: 'e2e-author@novel.local',
  password: 'E2EAuthor123456',
};

test('author can access the content appeal workspace', async ({ page }) => {
  await page.goto('http://localhost:5302/login');
  await page.locator('input[type="email"]').fill(authorCredentials.email);
  await page.locator('input[type="password"]').fill(authorCredentials.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/http:\/\/localhost:5302\/$/);

  await page.goto('http://localhost:5302/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('button', { name: '\u6982\u89c8' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.locator('.content-appeals-panel')).toBeVisible();
  await expect(page.locator('.content-appeals-panel').getByRole('heading')).toHaveCount(3);
});
