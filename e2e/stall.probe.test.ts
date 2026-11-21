import { test } from './test';

const big = /\/parts\/[\da-f]{64}$|\.(?:pch|tar|wasm)(?:\.json)?$/u;
const blocked = process.env.BLOCK === '1';
const watchFor = 25_000;
const noticeable = 50;

test.use({ compiler: !blocked });

test('where the page stops drawing', async ({ browserName, page }) => {
  test.setTimeout(120_000);
  const finished: number[] = [];
  page.on('requestfinished', (request) => {
    if (big.test(request.url())) {
      finished.push(Date.now());
    }
  });
  await page.addInitScript(() => {
    const gaps: { at: number; gap: number }[] = [];
    Object.assign(globalThis, { probe: gaps });
    globalThis.addEventListener('load', () => {
      let last = performance.now();
      const tick = (now: number): void => {
        gaps.push({ at: performance.timeOrigin + now, gap: now - last });
        last = now;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  const started = Date.now();
  await page.goto('/learn/start/');
  await page.keyboard.press('Shift');
  await page.waitForTimeout(watchFor);
  const gaps: { at: number; gap: number }[] = await page.evaluate(() =>
    Reflect.get(globalThis, 'probe'),
  );
  const since = (at: number): number => Math.round(at - started);
  const worst = gaps.reduce((best, one) => (one.gap > best.gap ? one : best), { at: started, gap: 0 });
  console.log(
    `PROBE ${JSON.stringify({
      agent: await page.evaluate(() => navigator.userAgent),
      blocked,
      browserName,
      downloads: finished.length,
      firstDone: finished.length > 0 ? since(Math.min(...finished)) : null,
      lastDone: finished.length > 0 ? since(Math.max(...finished)) : null,
      noticeable: gaps.filter((one) => one.gap > noticeable).map((one) => [since(one.at), Math.round(one.gap)]),
      platform: process.platform,
      worst: [since(worst.at), Math.round(worst.gap)],
    })}`,
  );
});
