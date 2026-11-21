import { type Page } from '@playwright/test';
import { array, boolean, number, object, record, string, union } from 'zod';

import { readStored } from './stored';
import { expect, test } from './test';

const value = union([boolean(), number(), string()]);
const data = record(string(), value);
const fingerprintEvents = array(object({ data: data.default({}), kind: string() }));

const fingerprints = async (page: Page): Promise<Record<string, boolean | number | string>[]> =>
  fingerprintEvents
    .parse(await readStored(page))
    .filter((event) => event.kind === 'device.fingerprint')
    .map((event) => event.data);

const countCanvasReads = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const { prototype } = HTMLCanvasElement;
    const original: unknown = Reflect.get(prototype, 'toDataURL');
    if (typeof original !== 'function') {
      return;
    }
    Reflect.set(globalThis, 'canvasReads', 0);
    const counted = new Proxy(original, {
      apply: (target, self, args): unknown => {
        Reflect.set(globalThis, 'canvasReads', Number(Reflect.get(globalThis, 'canvasReads')) + 1);
        const drawn: unknown = Reflect.apply(target, self, args);
        return drawn;
      },
    });
    Reflect.set(prototype, 'toDataURL', counted);
  });
};

const canvasReads = async (page: Page): Promise<number> =>
  await page.evaluate(() => Number(Reflect.get(globalThis, 'canvasReads')));

test('on WebKit the device fingerprint is taken without drawing on a canvas', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'webkit', 'only WebKit leaves the canvas out');
  await countCanvasReads(page);
  await page.goto('/learn/start/');
  await expect.poll(async () => await fingerprints(page)).toHaveLength(1);
  const [taken] = await fingerprints(page);
  expect(taken?.skipped).toBe('canvas');
  expect(taken?.visitor).toMatch(/^[\da-f]{32}$/u);
  expect(await canvasReads(page)).toBe(0);
});

test('elsewhere the device fingerprint is taken as before', async ({ browserName, page }) => {
  test.skip(browserName === 'webkit', 'WebKit leaves the canvas out');
  await page.goto('/learn/start/');
  await expect.poll(async () => await fingerprints(page)).toHaveLength(1);
  const [taken] = await fingerprints(page);
  expect(taken?.skipped).toBeUndefined();
  expect(taken?.confidence).toEqual(expect.any(Number));
});
