import { expect, openApp, test } from './fixtures';

test('runs every operation without a request to another origin', async ({
  page,
}) => {
  await openApp(page);
  await page.getByLabel(/01 — Input/).fill('Grown slowly · ghbdtn · Zm9v');
  await expect(page.locator('.row')).toHaveCount(28);

  await page.getByRole('button', { name: 'Recipe' }).click();
  const ops = page.getByRole('navigation', { name: 'Operations' });
  const adds = ops.getByRole('button', { name: /^Add / });
  const count = await adds.count();
  expect(count).toBe(27);
  for (let i = 0; i < count; i++) {
    await adds.nth(i).click();
  }
  await page.getByLabel('03 — Input').fill('Zm9v');
  await expect(page.locator('.trace-row')).toHaveCount(27);

  await page.getByRole('button', { name: 'Share link' }).click();
  await expect(page.getByLabel('Link', { exact: true })).toHaveValue(/#r=/);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('privacy-badge')).toContainText('0 requests');
});

test('the Content Security Policy blocks requests to other origins', async ({
  page,
}) => {
  await openApp(page);
  const blocked = await page.evaluate(async () => {
    try {
      await fetch('https://example.com/');
      return false;
    } catch {
      return true;
    }
  });
  expect(blocked).toBe(true);
  await expect(page.getByTestId('privacy-badge')).toContainText('1 blocked');
});

test('the request counter measures what the page loaded', async ({ page }) => {
  await openApp(page);
  const badge = page.getByTestId('privacy-badge');
  await expect(badge).toContainText('Local only · 0 requests');
  await expect(badge).toContainText(/[1-9]\d* files from this site/);
});
