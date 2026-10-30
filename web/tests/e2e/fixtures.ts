// Every test runs with a guard that fails it when the page sends a
// request to any origin but its own.

import { test as base, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const ORIGIN = 'http://localhost:4173';

interface Fixtures {
  offOrigin: string[];
}

export const test = base.extend<Fixtures>({
  offOrigin: [
    async ({ context }, use) => {
      const seen: string[] = [];
      await context.route(
        (url) => /^(https?|wss?):$/.test(url.protocol) && url.origin !== ORIGIN,
        (route) => {
          seen.push(route.request().url());
          return route.abort('blockedbyclient');
        },
      );
      await use(seen);
      expect(seen, 'requests to other origins').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function openApp(page: Page): Promise<void> {
  await page.goto('./');
  await expect(page.getByRole('navigation', { name: 'Mode' })).toBeVisible();
}

/** The value cell of a board row, by its label */
export function boardRow(page: Page, label: string) {
  return page
    .locator('.row')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('.row-value, .row-note');
}
