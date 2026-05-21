import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tests share Supabase auth state — keep serial
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8888',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    headless: true,
    navigationTimeout: 30_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: 'netlify dev --dir . --functions netlify/functions --offline --port 8888',
    url: 'http://localhost:8888',
    reuseExistingServer: true,
    timeout: 120_000,
    cwd: './designer-plan-site',
    stdout: 'pipe',
    stderr: 'pipe'
  }
});
