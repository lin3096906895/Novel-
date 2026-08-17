import { defineConfig } from '@playwright/test';

const chromeExecutable = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  globalSetup: './apps/server/test/e2e-global-setup.ts',
  globalTeardown: './apps/server/test/e2e-global-teardown.ts',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5300',
    browserName: 'chromium',
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromeExecutable,
    },
    userAgent: 'NovelPlatformE2E',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'corepack pnpm --filter @novel/server dev',
      url: 'http://127.0.0.1:3400/api/health',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        HOST: '127.0.0.1',
        PORT: '3400',
        WEB_ORIGIN: 'http://localhost:5300',
        AUTHOR_ORIGIN: 'http://localhost:5302',
        ADMIN_ORIGIN: 'http://localhost:5301',
      },
    },
    {
      command: 'corepack pnpm --filter @novel/web dev',
      url: 'http://localhost:5300',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:3400/api' },
    },
    {
      command: 'corepack pnpm --filter @novel/author dev',
      url: 'http://localhost:5302',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:3400/api' },
    },
    {
      command: 'corepack pnpm --filter @novel/admin dev',
      url: 'http://localhost:5301',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:3400/api' },
    },
  ],
});
