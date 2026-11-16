import { expect, test, type Page } from '@playwright/test';
import { propertyTest, testCoverageToJSON } from '@xstate/test';
import { createPlaywrightSut } from '@xstate/test/playwright';
import { constant } from 'fast-check';
import { array } from 'zod';

import { beatSchema, sceneMachine, type BeatMeta } from '../src/lib/scene/machine';

const path = '/learn/start/';
const boundary = 'line-main';
const runs = 6;
const commands = 14;
const seedPath = '/favicon.ico';

let visits = 0;

const openSeed = async (page: Page): Promise<void> => {
  visits += 1;
  await page.goto(`${seedPath}?visit=${String(visits)}`);
};

const reset = async (page: Page): Promise<void> => {
  await openSeed(page);
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<null>((resolve) => {
      const removal = indexedDB.deleteDatabase('konekode');
      for (const name of ['success', 'error', 'blocked']) {
        removal.addEventListener(name, () => {
          resolve(null);
        });
      }
    });
  });
  await page.goto(path);
  await page.locator('[data-scene][data-ready="true"]').waitFor();
};

const readMetas = async (page: Page): Promise<BeatMeta[]> => {
  const raw = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-beat]')].map((beat) => {
      const { after, expect: wanted, id = '', wait = '', when = '' } = beat.dataset;
      return { expect: wanted ?? null, id, next: after === 'next', wait, when };
    }),
  );
  return array(beatSchema).parse(raw);
};

const currentId = async (page: Page): Promise<string> =>
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-scene][data-ready="true"]');
    const shown = [...(root?.querySelectorAll<HTMLElement>('[data-beat]:not([hidden])') ?? [])];
    return shown.at(-1)?.dataset.id ?? '';
  });

const settled = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-scene][data-ready="true"]')).not.toHaveAttribute(
    'data-revealing',
    'true',
  );
};

test('開場的對話：隨機往前往回，頁面和狀態機每一步都在同一句', async ({ page }, testInfo) => {
  await reset(page);
  const beats = await readMetas(page);
  const limit = beats.findIndex((beat) => beat.id === boundary);
  expect(limit).toBeGreaterThan(1);

  const { coverage } = await propertyTest(sceneMachine, {
    deriveEvents: false,
    events: {
      BACK: constant({ full: false }),
      NEXT: {
        generate: constant({ full: false }),
        when: ({ snapshot }) => snapshot.matches('ready') && snapshot.context.index + 1 < limit,
      },
      REVEALED: {
        generate: constant({}),
        when: ({ snapshot }) => snapshot.matches('revealing'),
      },
    },
    input: { beats, passed: [], position: null },
    maxCommands: commands,
    numRuns: runs,
    seed: 1,
    sut: createPlaywrightSut(page, {
      events: {
        BACK: async () => {
          await page.keyboard.press('ArrowLeft');
        },
        NEXT: async () => {
          await page.keyboard.press('Space');
        },
        REVEALED: async () => {
          await settled(page);
        },
      },
      projectModel: (snapshot) => snapshot.context.beats[snapshot.context.index]?.id ?? '',
      read: async () => await currentId(page),
      reset: async () => {
        await reset(page);
      },
      testInfo,
    }),
  });
  const { totals } = testCoverageToJSON(coverage);
  expect(totals.steps).toBeGreaterThan(runs);
  expect(totals.sutComparisons).toBeGreaterThan(runs);
});
