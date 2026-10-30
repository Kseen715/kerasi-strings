import { ORIGIN, boardRow, expect, openApp, test } from './fixtures';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('shows every transform as you type', async ({ page }) => {
  await openApp(page);
  await page.getByLabel(/01 — Input/).fill('Grown slowly, cut sharp');

  await expect(boardRow(page, 'snake_case')).toHaveText(
    'grown_slowly_cut_sharp',
  );
  await expect(boardRow(page, 'Base32 encode')).toHaveText(
    'I5ZG653OEBZWY33XNR4SYIDDOV2CA43IMFZHA===',
  );
  await expect(boardRow(page, 'SHA-256')).toHaveText(
    'e8a5ef5c4683c0e0a8bc2fd50c639eedf5da6698a66a760d80b719f0dad0d797',
  );
  await expect(boardRow(page, 'Fix layout')).toHaveText(
    'Пкщцт ыдщцднб сге ырфкз',
  );
});

test('copies a row and sends another to the input', async ({ page }) => {
  await openApp(page);
  const input = page.getByLabel(/01 — Input/);
  await input.fill('Ghbdtn rfr ltkf');
  await expect(boardRow(page, 'Fix layout')).toHaveText('Привет как дела');

  await page.getByRole('button', { name: 'Copy Fix layout' }).click();
  await expect(page.getByText('Copied Fix layout')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe('Привет как дела');

  await boardRow(page, 'Fix layout').click();
  await expect(input).toHaveValue('Привет как дела');
});

test('hashes a dropped file', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('file-input').setInputFiles({
    name: 'blob.bin',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from([0xff, 0x00]),
  });
  await expect(page.getByText('blob.bin')).toBeVisible();
  await expect(boardRow(page, 'MD5')).toHaveText(
    'e0e8bfafbb0689563b2fba789c97b3cc',
  );
});

test('switches themes on the whole page', async ({ page }) => {
  await openApp(page);
  for (const theme of ['wine', 'rust-dark', 'sakura-dark']) {
    await page.getByLabel('Theme').selectOption(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }
});

test('loads the Unicode name table only for a \\N{...} escape', async ({
  page,
}) => {
  const names: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('strings_wasm_names')) {
      names.push(request.url());
    }
  });
  await openApp(page);
  const input = page.getByLabel(/01 — Input/);

  await input.fill(String.raw`п\xe9`);
  await expect(boardRow(page, 'Unicode escape decode')).toHaveText('пé');
  expect(names).toEqual([]);

  await input.fill(String.raw`\N{BULLET} \N{em dash}`);
  await expect(boardRow(page, 'Unicode escape decode')).toHaveText('• —');
  expect(names.length).toBeGreaterThan(0);
  expect(names.every((url) => url.startsWith(ORIGIN))).toBe(true);
});
