import { expect, openApp, test } from './fixtures';

test('builds and edits a recipe by keyboard only', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  await page.keyboard.type('fix layout');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('title');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('base64 enc');
  await page.keyboard.press('Enter');

  await page.getByLabel('03 — Input').fill('ghbdtn vbh');
  const output = page.getByRole('status', { name: '04 — Output' });
  await expect(output).toHaveText('0J/RgNC40LLQtdGCINCc0LjRgA==');

  const title = page.getByRole('button', { name: 'Step 2: Title Case' });
  await title.focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect(
    page.getByRole('button', { name: 'Step 3: Title Case' }),
  ).toBeFocused();
  await page.keyboard.press('Delete');
  await expect(output).toHaveText('0L/RgNC40LLQtdGCINC80LjRgA==');

  await page.getByRole('button', { name: 'Board' }).click();
  await expect(page.getByLabel(/01 — Input/)).toHaveValue('ghbdtn vbh');
});

test('opens a shared recipe from its link', async ({ page, context }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Recipe' }).click();
  await page.getByRole('button', { name: 'Add SCREAMING-KEBAB' }).click();
  await page.getByLabel('03 — Input').fill('shared text');
  await page.getByRole('button', { name: 'Share link' }).click();
  await page.getByRole('switch', { name: /Include the input/ }).click();
  const link = page.getByLabel('Link', { exact: true });
  await expect(link).toHaveValue(/#r=.+&i=.+/);
  const url = await link.inputValue();

  const other = await context.newPage();
  await other.goto(url);
  await expect(other.getByText('Opened the shared recipe')).toBeVisible();
  await expect(other.getByRole('status', { name: '04 — Output' })).toHaveText(
    'SHARED-TEXT',
  );
  expect(new URL(other.url()).hash).toBe('');
});
