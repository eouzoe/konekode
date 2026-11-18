import { defineConfig, devices } from '@playwright/test';

const port = 8788;
const second = 1000;
const testSeconds = 420;
const serverSeconds = 90;
const expectSeconds = 10;
const actionSeconds = 10;
const pageSeconds = 30;

export default defineConfig({
  expect: { timeout: expectSeconds * second },
  forbidOnly: true,
  fullyParallel: false,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  reporter: 'list',
  testDir: 'e2e',
  timeout: testSeconds * second,
  use: {
    actionTimeout: actionSeconds * second,
    baseURL: `http://localhost:${String(port)}`,
    navigationTimeout: pageSeconds * second,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `bun x wrangler d1 migrations apply cp-intake --local && bun x wrangler d1 execute cp-intake --local --command "DELETE FROM intake_usage" && bun x wrangler dev --port ${String(port)}`,
    reuseExistingServer: true,
    timeout: serverSeconds * second,
    url: `http://localhost:${String(port)}/learn/start/`,
  },
  workers: 2,
});
