import { boardRow, expect, openApp, test } from './fixtures';

test('shows the board groups as tabs on a phone', async ({ page }) => {
  await openApp(page);
  await page.getByLabel(/01 — Input/).fill('Grown slowly');
  await expect(boardRow(page, 'camelCase')).toHaveText('grownSlowly');
  await page.getByRole('tab', { name: 'Hash' }).click();
  await expect(page.getByRole('heading', { name: 'Hash' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Case' })).toHaveCount(0);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
});

test('works by keyboard on a phone width too', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Find operation' }).click();
  await page.keyboard.type('md5');
  await page.keyboard.press('Enter');
  await page.getByLabel('03 — Input').fill('abc');
  await expect(page.getByRole('status', { name: '04 — Output' })).toHaveText(
    '900150983cd24fb0d6963f7d28e17f72',
  );
});
