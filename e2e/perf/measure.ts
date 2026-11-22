import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

import { bytesBy, readProbe, watchPage, type Probe } from './probe';

interface Network {
  readonly down: number;
  readonly latency: number;
  readonly up: number;
}

interface Profile {
  readonly cpu: number;
  readonly name: string;
  readonly network: Network | null;
}

interface Visit {
  readonly path: string;
  readonly profile: Profile;
  readonly round: number;
}

const kibi = 1024;
const bitsPerByte = 8;
const megabit = kibi * kibi;
const slowDown = 1.6;
const slowUp = 0.75;
const slowLatency = 150;
const slowCpu = 4;
const settleMs = 3000;
const readyMs = 60_000;
const width = 1366;
const height = 768;
const places = 3;
const ownArguments = 2;
const defaultRounds = 3;

const profiles: readonly Profile[] = [
  { cpu: 1, name: 'fast', network: null },
  {
    cpu: slowCpu,
    name: 'slow',
    network: {
      down: (slowDown * megabit) / bitsPerByte,
      latency: slowLatency,
      up: (slowUp * megabit) / bitsPerByte,
    },
  },
];

const pages = ['/', '/learn/start/'];

const [base = 'http://localhost:8796', rounds = String(defaultRounds)] =
  process.argv.slice(ownArguments);

const throttle = async (context: BrowserContext, page: Page, profile: Profile): Promise<void> => {
  const client = await context.newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu });
  if (profile.network !== null) {
    await client.send('Network.emulateNetworkConditions', {
      downloadThroughput: profile.network.down,
      latency: profile.network.latency,
      offline: false,
      uploadThroughput: profile.network.up,
    });
  }
};

const summary = (probe: Probe) => {
  const ready = Math.round(probe.ready);
  return {
    beforeFcp: bytesBy(probe, probe.fcp),
    beforeReady: bytesBy(probe, probe.ready),
    fcp: Math.round(probe.fcp),
    ready,
    shifted: Number(probe.shifted.toFixed(places)),
    total: bytesBy(probe, Number.POSITIVE_INFINITY),
  };
};

const settle = async (page: Page, path: string): Promise<void> => {
  if (path.includes('/learn/')) {
    await page.waitForSelector('[data-scene][data-ready="true"]', { timeout: readyMs });
  }
  await page.waitForTimeout(settleMs);
};

const visit = async (context: BrowserContext, { path, profile }: Visit) => {
  const page = await context.newPage();
  await throttle(context, page, profile);
  await watchPage(page);
  await page.goto(`${base}${path}`, { waitUntil: 'load' });
  await settle(page, path);
  const probe = await readProbe(page);
  await page.close();
  return summary(probe);
};

const measure = async (browser: Browser, where: Visit) => {
  const context = await browser.newContext({ viewport: { height, width } });
  const cold = await visit(context, where);
  const warm = await visit(context, where);
  await context.close();
  const label = { path: where.path, profile: where.profile.name, round: where.round };
  return [
    { ...label, visit: 'cold', ...cold },
    { ...label, visit: 'warm', ...warm },
  ];
};

const browser = await chromium.launch();
for (let round = 1; round <= Number(rounds); round += 1) {
  for (const profile of profiles) {
    for (const path of pages) {
      for (const row of await measure(browser, { path, profile, round })) {
        process.stdout.write(`${JSON.stringify(row)}\n`);
      }
    }
  }
}
await browser.close();
