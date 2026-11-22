import { budgets } from './perf/budget';
import { expect, test } from './test';

interface Spent {
  readonly blocking: readonly string[];
  readonly firstPaint: number;
  readonly usable: number;
}

for (const budget of budgets) {
  test(`${budget.path} stays within what it may load before it is seen and usable`, async ({
    browserName,
    page,
  }) => {
    test.skip(browserName !== 'chromium', 'only Chromium reports which requests block rendering');
    await page.goto(budget.path, { waitUntil: 'load' });
    if (budget.path.includes('/learn/')) {
      await page.locator('[data-scene][data-ready="true"]').waitFor();
    }
    const spent: Spent = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType('navigation');
      if (!(navigation instanceof PerformanceNavigationTiming)) {
        throw new TypeError('no navigation entry');
      }
      const marks = performance.getEntriesByName('scene-ready');
      const usableAt = marks[0]?.startTime ?? navigation.loadEventEnd;
      const resources = performance
        .getEntriesByType('resource')
        .filter((entry) => entry instanceof PerformanceResourceTiming);
      const blocking = resources.filter(
        (entry) =>
          Reflect.get(entry, 'renderBlockingStatus') === 'blocking' ||
          new URL(entry.name).pathname.endsWith('.css'),
      );
      const early = resources.filter((entry) => entry.responseEnd <= usableAt);
      return {
        blocking: blocking.map((entry) => new URL(entry.name).pathname),
        firstPaint:
          navigation.transferSize +
          blocking.reduce((total, entry) => total + entry.transferSize, 0),
        usable:
          navigation.transferSize + early.reduce((total, entry) => total + entry.transferSize, 0),
      };
    });
    test.info().annotations.push({ description: JSON.stringify(spent), type: 'spent' });
    expect(spent.blocking).toEqual([]);
    expect(spent.firstPaint).toBeLessThanOrEqual(budget.firstPaint);
    expect(spent.usable).toBeLessThanOrEqual(budget.usable);
  });
}
