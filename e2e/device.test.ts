import { ui } from '@konekode/course/ui';
import { devices, type Route } from '@playwright/test';

import { fullscreenMark } from '../src/lib/scene/conditions';
import { currentId } from './scene-view';
import { expect, test, type Page } from './test';

const ready = '[data-scene][data-ready="true"]';
const scripts = /\/_astro\/[^/]+\.js(?:\?|$)/u;
const shownBeats = '.words [data-beat]:visible';
const fullscreenKeys = [
  ui['key.fullscreen.pc'],
  ui['key.fullscreen.mac'],
  ui['key.fullscreen.chromeos'],
];
const enoughOfTheBox = 0.75;
const mostLines = 3;

const openUnit = async (page: Page): Promise<void> => {
  await page.goto('/learn/start/');
  await page.locator(ready).waitFor();
};

const openBeforeScripts = async (page: Page): Promise<void> => {
  const held: Array<Route> = [];
  await page.route(scripts, (route) => {
    held.push(route);
  });
  await page.goto('/learn/start/', { waitUntil: 'commit' });
};

const wordsShare = async (page: Page): Promise<{ lines: number; share: number }> =>
  await page.evaluate(() => {
    const box = document.querySelector('[data-role="dialogue"]');
    const words = box?.querySelector('.words');
    const shown = words?.querySelector('[data-beat]:not([hidden])');
    if (box === null || words === null || words === undefined) {
      return { lines: 0, share: 0 };
    }
    const range = document.createRange();
    range.selectNodeContents(shown ?? words);
    const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    return {
      lines: tops.size,
      share: words.getBoundingClientRect().width / box.getBoundingClientRect().width,
    };
  });

test.describe('on a narrow computer screen', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('the words of the dialogue get the width of the box, not a sliver between the name and the tools', async ({
    page,
  }) => {
    await openUnit(page);
    const { lines, share } = await wordsShare(page);
    expect(share).toBeGreaterThan(enoughOfTheBox);
    expect(lines).toBeLessThanOrEqual(mostLines);
  });
});

test('a computer is told its own full-screen key, and no placeholder is left in any sentence', async ({
  page,
}) => {
  await openUnit(page);
  const says = await page.locator('[data-beat]').allTextContents();
  expect(says.filter((say) => say.includes(fullscreenMark))).toEqual([]);
  const ask = await page.locator('[data-id="fullscreen-ask"]').textContent();
  expect(fullscreenKeys.some((key) => ask?.includes(key) === true)).toBe(true);
});

test('before any script arrives, a computer already reads one full-screen key and no placeholder', async ({
  page,
}) => {
  await openBeforeScripts(page);
  const shown = page.locator(shownBeats);
  await expect(shown).toHaveCount(1);
  expect(await shown.textContent()).not.toContain(fullscreenMark);
  const keys = shown.locator('[data-fullscreen-key]');
  await expect(keys).toHaveCount(1);
  expect(fullscreenKeys).toContain(await keys.textContent());
});

test.describe('on a Mac', () => {
  test.use({ extraHTTPHeaders: { 'sec-ch-ua-platform': '"macOS"' } });

  test('before any script arrives, the page from the server already names the Mac key', async ({
    page,
  }) => {
    await openBeforeScripts(page);
    const keys = page.locator(`${shownBeats} [data-fullscreen-key]`);
    await expect(keys).toHaveCount(1);
    await expect(keys).toHaveText(ui['key.fullscreen.mac']);
  });
});

for (const name of ['iPhone 15', 'Pixel 7', 'iPad Pro 11']) {
  test.describe(`on a ${name}`, () => {
    test.skip(
      ({ browserName }) => browserName === 'firefox',
      'Playwright has no mobile emulation for Firefox',
    );
    const { deviceScaleFactor, hasTouch, isMobile, userAgent, viewport } =
      devices[name] ?? devices['iPhone 15'];
    test.use({ deviceScaleFactor, hasTouch, isMobile, userAgent, viewport });

    test('before any script arrives, the only sentence shown is the introduction', async ({
      page,
    }) => {
      await openBeforeScripts(page);
      await expect(page.locator(shownBeats)).toHaveCount(1);
      await expect(page.locator(shownBeats)).toHaveAttribute('data-id', 'intro');
    });

    test('nothing is said about full screen, and nothing is suggested', async ({ page }) => {
      await openUnit(page);
      await expect(page.locator('[data-beat][data-needs]')).toHaveCount(0);
      expect(await currentId(page)).toBe('intro');
      await expect(page.locator('[data-role="dialogue"]')).toBeInViewport({ ratio: 1 });
      const { lines } = await wordsShare(page);
      expect(lines).toBeLessThanOrEqual(mostLines);
    });
  });
}
