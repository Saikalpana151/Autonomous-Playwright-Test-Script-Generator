import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './repositories/tests',
  timeout: 30000,
  expect: {
    timeout: 15000,
  },
  reporter: 'line',
  use: {
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
