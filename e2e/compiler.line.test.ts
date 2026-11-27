import { ui } from '@konekode/course/ui';

import { open, output, status } from './start-support';
import { expect, test, type Page } from './test';

const part = /\/parts\/[\da-f]{64}$/u;
const listing = /(?:\.(?:pch|tar|wasm)\.json|\/compiler\/parts\.json)$/u;
const whole = /(?:\/llvm[^/]*\.(?:tar|wasm)|\/std\.pch)$/u;
const partLimit = 1024 * 1024;
const crawler = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const compilerScript = /\/compiler\.worker[^/]*\.js(?:\?|$)/u;
const prefetchScript = /\/prefetch\.worker[^/]*\.js(?:\?|$)/u;
const partList = /\/compiler\/parts\.json$/u;
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

const neverAnswer = async (page: Page, pattern: RegExp): Promise<{ count: number }> => {
  const held = { count: 0 };
  await page.route(pattern, () => {
    held.count += 1;
  });
  return held;
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

  test('a background download that never starts does not keep a run from finishing', async ({
    page,
  }) => {
    test.setTimeout(firstRun + gaveUp);
    const held = await neverAnswer(page, prefetchScript);
    await open(page, 'task');
    await expectRuns(page);
    expect(held.count).toBeGreaterThan(0);
  });

  test('a part list that never answers does not keep a run from finishing', async ({ page }) => {
    test.setTimeout(firstRun + gaveUp);
    const held = await neverAnswer(page, partList);
    await open(page, 'task');
    await expectRuns(page);
    expect(held.count).toBeGreaterThan(0);
  });
});

test.describe('a crawler', () => {
  test.use({ compiler: true, userAgent: crawler });

  test('never fetches the compiler, even on a lesson', async ({ page }) => {
    const asked: Array<string> = [];
    page.on('request', (request) => {
      if (part.test(request.url()) || listing.test(request.url())) {
        asked.push(request.url());
      }
    });
    await page.goto('/learn/start/');
    await page.locator('[data-scene][data-ready="true"]').waitFor();
    await pastIdle(page);
    await pastIdle(page);
    expect(asked).toEqual([]);
  });
});

test.describe('when the compiler is fetched', () => {
  test.use({ compiler: true });

  test('a page without a code runner never fetches it', async ({ page }) => {
    const asked: Array<string> = [];
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

  test('a lesson fetches every part as a plain static file no bigger than one part', async ({
    page,
  }) => {
    test.setTimeout(firstRun);
    const parts: Array<{ caching: string | null; encoding: string | null; size: number }> = [];
    const wholes: Array<string> = [];
    const marks: { started: Promise<number> | null } = { started: null };
    page.on('request', (request) => {
      if (whole.test(new URL(request.url()).pathname)) {
        wholes.push(request.url());
      }
      if (part.test(request.url())) {
        marks.started ??= page.evaluate(() => performance.now());
      }
    });
    page.on('response', (response) => {
      if (!part.test(response.url())) {
        return;
      }
      const headers = response.headers();
      parts.push({
        caching: headers['cache-control'] ?? null,
        encoding: headers['content-encoding'] ?? null,
        size: Number(headers['content-length'] ?? Infinity),
      });
    });
    await page.addInitScript(() => {
      const ticks: Array<number> = [];
      Reflect.set(globalThis, 'drawTicks', ticks);
      const tick = (now: number): void => {
        ticks.push(now);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto('/learn/start/');
    const listed = await page.evaluate(async () => {
      const answer = await fetch('/compiler/parts.json');
      return (await answer.text()).match(/[\da-f]{64}/gu)?.length ?? 0;
    });
    expect(listed).toBeGreaterThan(0);
    await expect.poll(() => parts.length, { timeout: firstRun }).toBe(listed);
    expect(wholes).toEqual([]);
    for (const one of parts) {
      expect(one.encoding).toBeNull();
      expect(one.size).toBeLessThanOrEqual(partLimit);
      expect(one.caching).toContain('immutable');
    }
    const ended = await page.evaluate(() => performance.now());
    const from = (await marks.started) ?? ended;
    const times = await page.evaluate(() =>
      [Reflect.get(globalThis, 'drawTicks')]
        .flat()
        .filter((one: unknown): one is number => typeof one === 'number'),
    );
    const gaps = times
      .slice(1)
      .map((end, index) => ({ end, gap: end - (times[index] ?? end) }))
      .filter((one) => one.end >= from && one.end - one.gap <= ended);
    const drawn = {
      frames: gaps.length,
      longest: Math.round(Math.max(0, ...gaps.map((one) => one.gap))),
    };
    const note = `${test.info().project.name} on ${process.platform}: longest gap ${String(drawn.longest)} ms over ${String(drawn.frames)} frames while ${String(listed)} parts downloaded`;
    test.info().annotations.push({ description: note, type: 'download gap' });
    console.log(`::notice title=compiler download::${note}`);
    expect(drawn.frames).toBeGreaterThan(0);
  });

  test('a lesson starts fetching it only after the page has loaded', async ({ page }) => {
    let loadedAt = 0;
    const askedAt: Array<number> = [];
    page.on('load', () => {
      loadedAt = performance.now();
    });
    page.on('request', (request) => {
      if (listing.test(request.url())) {
        askedAt.push(performance.now());
      }
    });
    await page.goto('/learn/start/');
    await expect.poll(() => askedAt.length, { timeout: 30_000 }).toBeGreaterThan(0);
    expect(loadedAt).toBeGreaterThan(0);
    expect(Math.min(...askedAt)).toBeGreaterThanOrEqual(loadedAt);
  });
});
