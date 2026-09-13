import { expect, test } from '@playwright/test';

test('starts a real Phaser canvas from the accessible shift action', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('/');
  await page.getByRole('button', { name: 'Start shift', exact: true }).click();

  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.getByText('Initialization failed')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
