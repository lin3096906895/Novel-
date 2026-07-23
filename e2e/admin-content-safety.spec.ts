import { expect, test } from '@playwright/test';

const adminCredentials = {
  email: 'admin@novel.local',
  password: 'Admin123456',
};

test('admin can inspect content safety statistics and the appeal queue', async ({ page }) => {
  await page.goto('http://localhost:5301');

  await page.getByRole('textbox', { name: '* 邮箱' }).fill(adminCredentials.email);
  await page.getByRole('textbox', { name: '* 密码' }).fill(adminCredentials.password);
  await page.getByRole('button', { name: '登 录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '运营仪表盘' })).toBeVisible();

  await page.getByRole('menuitem', { name: /内容安全/ }).click();
  await expect(page.getByRole('heading', { name: '内容安全概览' })).toBeVisible();
  await expect(page.getByText('周期新增', { exact: true })).toBeVisible();
  await expect(page.getByText('目标类型分布', { exact: true })).toBeVisible();
  await expect(page.getByText('举报原因分布', { exact: true })).toBeVisible();

  const appealTab = page.getByRole('tab', { name: /申诉审核/ });
  await appealTab.click();
  await expect(appealTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: /申诉审核/ })).toBeVisible();
  await expect(page.getByPlaceholder('搜索目标、作者或申诉理由')).toBeVisible();
});
