import { openAt } from './fuzz-support';
import { test } from './test';

interface Mark {
  readonly at: number;
  readonly gap: number;
}

const input = '[data-typing-drill] [data-role="input"]';
const heavy = /std\.pch|llvm-resources|llvm\.core-/u;
const keys = '#include <bits/stdc++.h>\nusing namespace std;\n\nint main()\n{\ncin.tie(nullptr)';
const blocked = process.env.BLOCK === '1';
const pace = 250;
const after = 4000;
const longest = 90_000;
const quiet = 9000;

test('typing while the compiler downloads', async ({ browserName, page }) => {
  test.setTimeout(180_000);
  const finished: { at: number; url: string }[] = [];
  page.on('requestfinished', (request) => {
    if (heavy.test(request.url())) {
      finished.push({ at: Date.now(), url: request.url().replace(/^.*\//u, '') });
    }
  });
  if (blocked) {
    await page.route(/compiler\.worker/u, async (route) => {
      await route.abort();
    });
  }
  await openAt(page, 'type-template', input);
  await page.evaluate(() => {
    const gaps: Mark[] = [];
    let last = performance.now();
    const tick = (now: number): void => {
      gaps.push({ at: Date.now(), gap: now - last });
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    Object.assign(globalThis, { probeGaps: gaps });
  });
  const reads: Mark[] = [];
  const started = Date.now();
  await page.locator('[data-typing-drill]').click();
  await page.keyboard.press('i');
  const settled = (): boolean => {
    if (blocked) {
      return Date.now() - started > quiet;
    }
    return finished.length >= 3 && Date.now() - Math.max(...finished.map((one) => one.at)) > after;
  };
  for (let at = 0; !settled() && Date.now() - started < longest; at += 1) {
    const key = keys[at % keys.length] ?? ' ';
    await page.keyboard.press(key === '\n' ? 'Enter' : key);
    const before = Date.now();
    await page.evaluate(() =>
      document.querySelector('[data-typing-drill]')?.getAttribute('data-mode'),
    );
    reads.push({ at: before, gap: Date.now() - before });
    await page.waitForTimeout(pace);
  }
  const gaps: Mark[] = await page.evaluate(() => Reflect.get(globalThis, 'probeGaps'));
  const worst = (rows: readonly Mark[]): Mark =>
    rows.toSorted((one, other) => other.gap - one.gap)[0] ?? { at: started, gap: 0 };
  const near = (at: number): number =>
    Math.max(0, ...gaps.filter((one) => one.at >= at - 500 && one.at <= at + after).map((one) => one.gap));
  const quietGaps = gaps.filter((one) => one.at - started > 0 && one.at - started < 400);
  console.log(
    `PROBE ${JSON.stringify({
      agent: await page.evaluate(() => navigator.userAgent),
      blocked,
      browserName,
      finished: finished.map((one) => ({
        at: one.at - started,
        gapNear: Math.round(near(one.at)),
        url: one.url,
      })),
      frames: gaps.length,
      platform: process.platform,
      startGap: Math.round(worst(quietGaps).gap),
      worstGap: { at: worst(gaps).at - started, gap: Math.round(worst(gaps).gap) },
      worstRead: { at: worst(reads).at - started, took: worst(reads).gap },
    })}`,
  );
});
