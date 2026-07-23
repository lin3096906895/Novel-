import { expect, test } from '@playwright/test';

const authorCredentials = {
  email: 'e2e-author@novel.local',
  password: 'E2EAuthor123456',
};

test('author profile edits persist after refreshing the workbench', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(authorCredentials.email);
  await page.locator('input[type="password"]').fill(authorCredentials.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/author');
  const profileForm = page.locator('.author-profile-form');
  const penName = 'E2E Updated Author';
  const bio = 'Updated profile text used only for end-to-end regression coverage.';
  await expect(profileForm).toBeVisible();
  await profileForm.locator('input').fill(penName);
  await profileForm.locator('textarea').fill(bio);
  await profileForm.locator('button[type="submit"]').click();
  await expect(page.locator('.auth-message')).toBeVisible();

  await page.reload();
  await expect(profileForm.locator('input')).toHaveValue(penName);
  await expect(profileForm.locator('textarea')).toHaveValue(bio);
});
