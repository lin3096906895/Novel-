import { expect, test } from '@playwright/test';

const authorCredentials = {
  email: 'e2e-author@novel.local',
  password: 'E2EAuthor123456',
};

test('settings keeps account, reading, and account data workspaces separate', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(authorCredentials.email);
  await page.locator('input[type="password"]').fill(authorCredentials.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/settings');
  await expect(page.locator('.profile-settings-form')).toBeVisible();

  await page.getByRole('button', { name: '\u5b89\u5168' }).click();
  await expect(page.locator('.security-forms-column')).toBeVisible();
  await expect(page.locator('.security-session-section')).toBeHidden();

  await page.getByRole('button', { name: '\u8bbe\u5907' }).click();
  await expect(page.locator('.security-session-section')).toBeVisible();
  await expect(page.locator('.security-forms-column')).toBeHidden();

  await page.getByRole('button', { name: '\u9605\u8bfb' }).click();
  await expect(page.locator('.reading-stats-grid')).toBeVisible();
  await expect(page.locator('.profile-settings-form')).toBeHidden();

  await page.getByRole('button', { name: '\u6570\u636e\u4e0e\u6ce8\u9500' }).click();
  await expect(page.locator('.data-export-section')).toBeVisible();
  await expect(page.locator('.account-deletion-section')).toBeVisible();
});
