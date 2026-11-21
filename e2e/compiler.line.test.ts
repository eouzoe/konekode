import { ui } from '../src/lib/text/ui';
import { open, output, status } from './start-support';
import { expect, test, type Page } from './test';

const part = /\/parts\/[\da-f]{64}$/u;
const listing = /\.(?:pch|tar|wasm)\.json$/u;
const compilerScript = /\/compiler\.worker[^/]*\.js(?:\?|$)/u;
const firstRun = 150_000;
const gaveUp = 120_000;

const pastIdle = async (page: Page): Promise<void> => {
  await page.waitForLoadState('load');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        if ('requestIdleCallback' in globalThis) {
          requestIdleCallback(() => {
            resolve();
          });
          return;
        }
        setTimeout(resolve, 0);
      }),
  );
};

const runButton = (page: Page) => page.locator('[data-code-runner] [data-role="run"]');

const expectGaveUp = async (page: Page): Promise<void> => {
  await expect(status(page)).toHaveText(ui['run.unavailable'], { timeout: gaveUp });
  await expect(output(page)).toHaveText(ui['run.retry']);
};

const expectRuns = async (page: Page): Promise<void> => {
  await runButton(page).click();
  await expect(status(page)).toHaveText(ui['run.finished'], { timeout: firstRun });
};

const fakeCompiler = async (page: Page, body: string): Promise<void> => {
  await page.route(compilerScript, async (route) => {
    await route.fulfill({ body, contentType: 'text/javascript' });
  });
};

test.describe('the compiler line', () => {
  test.use({ compiler: true, reducedMotion: 'reduce' });

  test('a download that stops halfway ends in a clear result, and running again works', async ({
    page,
  }) => {
    test.setTimeout(firstRun + 2 * gaveUp);
    let held = 0;
    let passed = 0;
    await page.route(part, async (route) => {
      if (passed >= 3) {
        held += 1;
        return;
      }
      passed += 1;
      await route.fallback();
    });
    await open(page, 'task');
    await runButton(page).click();
    await expectGaveUp(page);
    expect(held).toBeGreaterThan(0);
    await page.unroute(part);
    await expectRuns(page);
  });

  test('a compiler that never finishes ends in a clear result, and running again works', async ({
    page,
  }) => {
    test.setTimeout(firstRun + 2 * gaveUp);
    await fakeCompiler(
      page,
      "globalThis.onmessage = () => { globalThis.postMessage({ kind: 'progress', percent: 100 }); };",
    );
    await open(page, 'task');
    await runButton(page).click();
    await expectGaveUp(page);
    await page.unroute(compilerScript);
    await expectRuns(page);
  });

  test('a compiler that never answers ends in a clear result, and running again works', async ({
    page,
  }) => {
    test.setTimeout(firstRun + 2 * gaveUp);
    await fakeCompiler(page, 'globalThis.onmessage = () => {};');
    await open(page, 'task');
    await runButton(page).click();
    await expectGaveUp(page);
    await page.unroute(compilerScript);
    await expectRuns(page);
  });
});

test.describe('when the compiler is fetched', () => {
  test.use({ compiler: true });

  test('a page without a code runner never fetches it', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (part.test(request.url()) || listing.test(request.url())) {
        asked.push(request.url());
      }
    });
    await page.goto('/');
    await pastIdle(page);
    await pastIdle(page);
    expect(asked).toEqual([]);
    await page.goto('/learn/start/');
    await expect.poll(() => asked.length, { timeout: 30_000 }).toBeGreaterThan(0);
  });

  test('a lesson starts fetching it only after the page has loaded', async ({ page }) => {
    let loadedAt = 0;
    const askedAt: number[] = [];
    page.on('load', () => {
      loadedAt = Date.now();
    });
    page.on('request', (request) => {
      if (listing.test(request.url())) {
        askedAt.push(Date.now());
      }
    });
    await page.goto('/learn/start/');
    await expect.poll(() => askedAt.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(loadedAt).toBeGreaterThan(0);
    expect(Math.min(...askedAt)).toBeGreaterThanOrEqual(loadedAt);
  });
});
