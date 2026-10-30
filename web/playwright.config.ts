import { defineConfig, devices } from '@playwright/test';

// The end-to-end tests run against the production build (npm run build),
// served as GitHub Pages serves it: under /kerasi-strings/.
const PORT = 4173;
export const BASE = `http://localhost:${PORT}/kerasi-strings/`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: 'phone.spec.ts',
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
      testMatch: 'phone.spec.ts',
    },
  ],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
  },
});
