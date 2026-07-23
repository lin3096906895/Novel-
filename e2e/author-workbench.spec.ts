import { expect, test } from '@playwright/test';

const authorCredentials = {
  email: 'author@novel.local',
  password: 'Admin123456',
};

test('author can access the content appeal workspace', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('邮箱').fill(authorCredentials.email);
  await page.getByLabel('密码').fill(authorCredentials.password);
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/author');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '内容申诉' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '可申诉内容' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '申诉记录' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新内容申诉' })).toBeVisible();
});
