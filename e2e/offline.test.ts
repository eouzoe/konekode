import { currentId } from './scene-view';
import { storedPosition } from './stored';
import { expect, test } from './test';

import type { BrowserContext, Page } from '@playwright/test';

const path = '/learn/start/';
const ready = '[data-scene][data-ready="true"]';

test.use({
  serviceWorkers: 'allow',
  tolerated: [/Failed to load resource: WebKit encountered an internal error/u],
});

const goOffline = async (context: BrowserContext, browserName: string): Promise<void> => {
  if (browserName !== 'firefox') {
    await context.setOffline(true);
    return;
  }
  await context.route('**/*', async (route) => {
    await route.abort('internetdisconnected');
  });
};

const goOnline = async (context: BrowserContext): Promise<void> => {
  await context.setOffline(false);
  await context.unrouteAll();
};

const cached = async (page: Page, address: string): Promise<boolean> =>
  await page.evaluate(async (wanted) => {
    const found = await caches.match(new URL(wanted, location.href).href);
    return found !== undefined;
  }, address);

const coreOf = async (page: Page, of: string): Promise<Array<string>> =>
  await page.evaluate(async (wanted) => {
    const response = await fetch('/core.json');
    const core: unknown = await response.json();
    if (typeof core !== 'object' || core === null) {
      return [];
    }
    const files: unknown = Reflect.get(core, wanted);
    if (!Array.isArray(files)) {
      return [];
    }
    return files.map(String);
  }, of);

const uncached = async (page: Page, addresses: ReadonlyArray<string>): Promise<Array<string>> => {
  const found = await Promise.all(addresses.map((address) => cached(page, address)));
  return addresses.filter((_address, at) => found[at] !== true);
};

test('a learner who was here before can reload offline and lands where they were', async ({
  browserName,
  context,
  page,
}) => {
  await page.goto(path);
  await page.locator(ready).waitFor();
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press('Space');
  }
  const here = await currentId(page);
  await expect.poll(async () => await storedPosition(page)).toBe(here);
  const core = await coreOf(page, path);
  await expect
    .poll(async () => await uncached(page, [path, ...core]), { timeout: 20_000 })
    .toEqual([]);
  await goOffline(context, browserName);
  await page.reload();
  await page.locator(ready).waitFor();
  await expect.poll(async () => await currentId(page)).toBe(here);
  await goOnline(context);
});

const assetsLoaded = async (page: Page): Promise<Array<string>> =>
  await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => new URL(entry.name))
      .filter((url) => url.origin === location.origin && url.pathname.startsWith('/_astro/'))
      .map((url) => url.pathname),
  );

test('the home page prepares the unit before the learner opens it', async ({
  browserName,
  context,
  page,
}) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const wanted = [path, ...(await coreOf(page, path)), ...(await assetsLoaded(page))];
  await expect.poll(async () => await uncached(page, wanted), { timeout: 20_000 }).toEqual([]);
  await goOffline(context, browserName);
  await page.locator('a[data-prepare]').click();
  await page.locator(ready).waitFor();
  await expect(page.locator('[data-beat]:not([hidden])').first()).toBeVisible();
  await goOnline(context);
});
