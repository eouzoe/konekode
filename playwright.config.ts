import { createHash } from 'node:crypto';

import { defineConfig, devices } from '@playwright/test';

const firstPort = 20_000;
const portCount = 20_000;
const workspace = import.meta.dirname;
const port =
  firstPort + (createHash('sha256').update(workspace).digest().readUInt32BE() % portCount);
const stage = 'e2e';
const fresh = `for (const path of ['.alchemy/local', '.alchemy/state/Konekode/${stage}']) require('node:fs').rmSync(path, { force: true, recursive: true })`;
const second = 1000;
const testSeconds = 420;
const serverSeconds = 90;
const expectSeconds = 10;
const actionSeconds = 10;
const pageSeconds = 30;
const remote = process.env.KONEKODE_E2E_BASE;
const local = `http://localhost:${String(port)}`;

const server = {
  command: `bun -e "${fresh}" && bun x alchemy dev --stage ${stage} --no-input`,
  env: {
    BUN_OPTIONS: '--conditions=distilled-lazy',
    KONEKODE_LOCAL: '1',
    SITE_PORT: String(port),
  },
  reuseExistingServer: true,
  timeout: serverSeconds * second,
  url: `${local}/learn/start/`,
};

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
    baseURL: remote ?? local,
    navigationTimeout: pageSeconds * second,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  ...(remote === undefined ? { webServer: server } : {}),
  workers: 2,
});
