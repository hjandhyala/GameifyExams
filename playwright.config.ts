import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    permissions: ['clipboard-read', 'clipboard-write'],
  },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'pixel-7', use: { ...devices['Pixel 7'] } },
    ...(process.env.E2E_ALL_BROWSERS
      ? [
          { name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },
          { name: 'iphone-15', use: { ...devices['iPhone 15'] } },
          { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
        ]
      : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `rm -rf node_modules/.cache/prepdle-e2e-pglite && npm run dev -w @prepdle/web -- -p ${PORT}`,
        url: `http://localhost:${PORT}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        env: { PGLITE_DIR: '../../node_modules/.cache/prepdle-e2e-pglite', DEV_ALLOW_ANY_DATE: '1', LAUNCH_DATE: '2026-07-15' },
      },
});
