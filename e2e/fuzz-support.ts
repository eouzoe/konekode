import { expect, type CDPSession, type Page } from '@playwright/test';

const modulus = 4_294_967_296;
const multiplier = 1_664_525;
const increment = 1_013_904_223;
let visits = 0;

const generator = (seed: number): (() => number) => {
  let state = seed % modulus;
  return () => {
    state = (Math.imul(state, multiplier) + increment + modulus) % modulus;
    return state / modulus;
  };
};

const pickFrom = <Item>(random: () => number, items: readonly Item[]): Item => {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) {
    throw new Error('nothing to pick from');
  }
  return item;
};

const openAt = async (page: Page, beat: string, focus: string): Promise<void> => {
  visits += 1;
  await page.goto(`/favicon.ico?fuzz=${String(visits)}`);
  await page.evaluate(async (ref) => {
    localStorage.clear();
    await new Promise<null>((resolve) => {
      const removal = indexedDB.deleteDatabase('konekode');
      for (const name of ['success', 'error', 'blocked']) {
        removal.addEventListener(name, () => {
          resolve(null);
        });
      }
    });
    const reached = { at: 1, device: 'e2e', id: 'e2e-1', kind: 'beat.reached', ref, unit: 'start' };
    localStorage.setItem('cp:events:v1', JSON.stringify([{ ...reached, version: 1 }]));
  }, beat);
  await page.goto('/learn/start/');
  await page.locator('[data-scene][data-ready="true"]').waitFor();
  await expect(page.locator(focus)).toBeFocused();
};

const slowdown = 4;
const every = 2;

const inputMethod = async (page: Page, browserName: string): Promise<CDPSession | null> => {
  if (browserName !== 'chromium') {
    return null;
  }
  return await page.context().newCDPSession(page);
};

const slowEveryOtherRound = async (session: CDPSession | null, round: number): Promise<void> => {
  if (session !== null && round % every === 1) {
    await session.send('Emulation.setCPUThrottlingRate', { rate: slowdown });
  }
};

export { generator, inputMethod, openAt, pickFrom, slowEveryOtherRound };
