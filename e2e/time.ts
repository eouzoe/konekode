import { type Page } from '@playwright/test';

const origin = Date.parse('2026-01-05T01:00:00Z');
const second = 1000;
const step = 50;
const limit = 120_000;

const held = new WeakSet<Page>();

const holdTime = async (page: Page): Promise<void> => {
  await page.clock.install({ time: origin });
  await page.clock.pauseAt(origin + second);
  held.add(page);
};

const isHeld = (page: Page): boolean => held.has(page);

const pass = async (page: Page, time: number): Promise<void> => {
  await page.clock.runFor(time);
};

interface Until {
  readonly every?: number;
  readonly label?: string;
  readonly within?: number;
}

const passUntil = async (
  page: Page,
  reached: () => Promise<boolean>,
  { every = step, label = 'the page', within = limit }: Until = {},
): Promise<void> => {
  for (let spent = 0; spent <= within; spent += every) {
    if (await reached()) {
      return;
    }
    await pass(page, every);
  }
  throw new Error(`${label} did not get there within ${String(within)} ms of page time`);
};

const focusArrives = async (page: Page, selector: string): Promise<void> => {
  const focused = async (): Promise<boolean> =>
    await page.locator(selector).evaluate((element) => element === document.activeElement);
  if (isHeld(page)) {
    await passUntil(page, focused, { label: `focus on ${selector}` });
  }
};

const laterStep = 250;

const laterStarts = async (page: Page): Promise<void> => {
  const started = async (): Promise<boolean> =>
    await page.evaluate(() => document.documentElement.dataset.later === 'started');
  await passUntil(page, started, { every: laterStep, label: 'the work kept for later' });
};

export { focusArrives, holdTime, isHeld, laterStarts, pass, passUntil };
