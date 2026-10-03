import { expect, type Page } from '@playwright/test';

/** Utility actions live behind the accessible Night Shift menu. */
export async function openRunMenu(page: Page): Promise<void> {
  const panel = page.locator('#run-menu-panel');
  if (!(await panel.isVisible())) await page.locator('#run-menu-toggle').click();
  await expect(panel).toBeVisible();
}
