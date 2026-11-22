import { type Page, type Route } from '@playwright/test';

import { currentId } from './scene-view';
import { open } from './start-support';
import { expect, test } from './test';

const path = '/learn/start/';
const script = /\/_astro\/[^/]+\.js(?:\?|$)/u;
const engine = /\/_astro\/konekode[^/]*\.wasm(?:\?|$)/u;
const ready = '[data-scene][data-ready="true"]';
const firstBeat = '[data-beat]:first-of-type';

interface Gate {
  readonly release: () => Promise<void>;
}

const hold = async (
  page: Page,
  pattern: RegExp,
  held: (address: string) => boolean,
): Promise<Gate> => {
  const waiting: Route[] = [];
  let opened = false;
  await page.route(pattern, async (route) => {
    if (opened || !held(new URL(route.request().url()).pathname)) {
      await route.fallback();
      return;
    }
    waiting.push(route);
  });
  return {
    release: async () => {
      opened = true;
      await Promise.all(waiting.splice(0).map((route) => route.fallback()));
    },
  };
};

const holdScripts = (page: Page, held: (address: string) => boolean): Promise<Gate> =>
  hold(page, script, held);

const box = async (page: Page, selector: string) => {
  const found = await page.locator(selector).boundingBox();
  if (found === null) {
    throw new Error(`${selector} is not on the page`);
  }
  return found;
};

const coreOf = async (page: Page, of: string): Promise<ReadonlySet<string>> => {
  const response = await page.request.get('/core.json');
  const core: unknown = await response.json();
  if (typeof core !== 'object' || core === null || !(of in core)) {
    throw new Error('core.json does not list the page');
  }
  const files: unknown = Reflect.get(core, of);
  if (!Array.isArray(files)) {
    throw new TypeError('core.json lists something other than files');
  }
  return new Set(files.map(String));
};

test('the opening sentence is drawn before any script arrives and stays where it is', async ({
  page,
}) => {
  const gate = await holdScripts(page, () => true);
  await page.goto(path, { waitUntil: 'commit' });
  const words = page.locator(`.words ${firstBeat}`);
  await expect(words).toBeVisible();
  await expect(page.locator('.words [data-beat]:visible')).toHaveCount(1);
  const text = await words.textContent();
  const before = {
    beat: await box(page, `.words ${firstBeat}`),
    dialogue: await box(page, '.dialogue'),
  };
  await gate.release();
  await page.locator(ready).waitFor();
  expect(await words.textContent()).toBe(text);
  expect(await box(page, '.dialogue')).toEqual(before.dialogue);
  expect(await box(page, `.words ${firstBeat}`)).toEqual(before.beat);
});

test('a key pressed while the engine is still starting moves on once it has', async ({ page }) => {
  const gate = await hold(page, engine, () => true);
  const asked = page.waitForRequest(engine);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await asked;
  const first = await page.locator(`.words ${firstBeat}`).getAttribute('data-id');
  await page.keyboard.press('Enter');
  await expect(page.locator(ready)).toHaveCount(0);
  await gate.release();
  await page.locator(ready).waitFor();
  await expect.poll(async () => await currentId(page)).not.toBe(first);
});

test('without scripts the opening sentence and the whole script are readable', async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(path);
  await expect(page.locator(`.words ${firstBeat}`)).toBeVisible();
  await expect(page.locator('.plain')).toBeVisible();
  const beats = await page.locator('.words [data-beat]').count();
  await expect(page.locator('.words [data-beat]:visible')).toHaveCount(beats);
  await expect(page.locator('.code')).toBeVisible();
  await context.close();
});

test('a part that has not arrived yet shows it is being prepared, then plays', async ({ page }) => {
  const core = await coreOf(page, path);
  const gate = await holdScripts(page, (address) => !core.has(address));
  await open(page, 'lets-type');
  await expect(page.locator('.supplying')).toBeHidden();
  await expect(page.locator('[data-scene]')).not.toHaveAttribute('data-revealing', 'true');
  await page.keyboard.press('Space');
  await expect.poll(async () => await currentId(page)).toBe('demo-intro');
  await expect(page.locator('[data-scene]')).toHaveAttribute('data-supplying', 'true');
  await expect(page.locator('.supplying')).toBeVisible();
  await gate.release();
  await expect(page.locator('.supplying')).toBeHidden();
  await expect(page.locator('[data-typing-drill]')).toHaveAttribute('data-demo', 'true');
});
