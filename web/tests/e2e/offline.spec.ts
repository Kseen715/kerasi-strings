import { boardRow, expect, openApp, test } from './fixtures';

test('works with the network off once loaded', async ({ page, context }) => {
  await openApp(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await page.getByLabel(/01 — Input/).fill('offline');
  await expect(boardRow(page, 'UPPER CASE')).toHaveText('OFFLINE');
  await expect(boardRow(page, 'SHA-1')).toHaveText(
    'd1ffda5dc9903c9a42d66636aea9405e311c6f85',
  );
});
