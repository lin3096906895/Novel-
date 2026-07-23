import { expect, test } from '@playwright/test';

const adminCredentials = {
  email: 'admin@novel.local',
  password: 'Admin123456',
};

test('admin can search the novel and user management workspaces', async ({ page }) => {
  await page.goto('http://localhost:5301');
  await page.getByRole('textbox', { name: '* \u90ae\u7bb1' }).fill(adminCredentials.email);
  await page.getByRole('textbox', { name: '* \u5bc6\u7801' }).fill(adminCredentials.password);
  await page.getByRole('button', { name: '\u767b \u5f55', exact: true }).click();

  await page.getByRole('menuitem', { name: '\u4f5c\u54c1\u7ba1\u7406' }).click();
  await expect(page.getByRole('heading', { name: '\u5168\u7ad9\u4f5c\u54c1' })).toBeVisible();
  const novelSearch = page.getByPlaceholder('\u641c\u7d22\u4e66\u540d\u3001\u4f5c\u8005\u6216\u7b80\u4ecb');
  await novelSearch.fill('\u661f\u6cb3');
  await novelSearch.press('Enter');
  await expect(page.getByText('\u661f\u6cb3\u65e7\u7ea6', { exact: true })).toBeVisible();

  await page.getByRole('menuitem', { name: '\u7528\u6237\u7ba1\u7406' }).click();
  await expect(page.getByRole('heading', { name: '\u7528\u6237\u5217\u8868' })).toBeVisible();
  const userSearch = page.getByPlaceholder('\u641c\u7d22\u6635\u79f0\u6216\u90ae\u7bb1');
  await userSearch.fill('e2e-author@novel.local');
  await userSearch.press('Enter');
  await expect(page.getByText('e2e-author@novel.local', { exact: true })).toBeVisible();
});
