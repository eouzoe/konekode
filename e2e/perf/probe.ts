import type { Page } from '@playwright/test';

interface Loaded {
  readonly at: number;
  readonly bytes: number;
  readonly name: string;
}

interface Probe {
  readonly fcp: number;
  readonly loaded: ReadonlyArray<Loaded>;
  readonly ready: number;
  readonly shifted: number;
}

interface Watch {
  fcp: number;
  ready: number;
  shifted: number;
}

const slot = 'perfProbe';

const watch = (name: string): void => {
  const state: Watch = { fcp: -1, ready: -1, shifted: 0 };
  Reflect.set(globalThis, name, state);
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === 'first-contentful-paint') {
        state.fcp = entry.startTime;
      }
    }
  }).observe({ buffered: true, type: 'paint' });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if ('value' in entry && 'hadRecentInput' in entry && entry.hadRecentInput === false) {
        state.shifted += Number(entry.value);
      }
    }
  }).observe({ buffered: true, type: 'layout-shift' });
  const seen = (): boolean => {
    if (document.querySelector('[data-scene][data-ready="true"]') === null) {
      return false;
    }
    state.ready = performance.now();
    return true;
  };
  const observer = new MutationObserver(() => {
    if (seen()) {
      observer.disconnect();
    }
  });
  observer.observe(document, { attributeFilter: ['data-ready'], attributes: true, subtree: true });
};

const watchPage = async (page: Page): Promise<void> => {
  await page.addInitScript(watch, slot);
};

const readProbe = (page: Page): Promise<Probe> =>
  page.evaluate((name) => {
    const found: unknown = Reflect.get(globalThis, name);
    const state = { fcp: -1, ready: -1, shifted: 0 };
    if (typeof found === 'object' && found !== null) {
      Object.assign(state, found);
    }
    const timed = [
      ...performance.getEntriesByType('navigation'),
      ...performance.getEntriesByType('resource'),
    ].filter(
      (entry): entry is PerformanceResourceTiming => entry instanceof PerformanceResourceTiming,
    );
    return {
      fcp: state.fcp,
      loaded: timed.map((entry) => ({
        at: entry.responseEnd,
        bytes: entry.transferSize,
        name: new URL(entry.name).pathname,
      })),
      ready: state.ready,
      shifted: state.shifted,
    };
  }, slot);

const bytesBy = (probe: Probe, moment: number): number =>
  probe.loaded.filter((entry) => entry.at <= moment).reduce((sum, entry) => sum + entry.bytes, 0);

export { bytesBy, readProbe, watchPage, type Loaded, type Probe };
