import { beatsOf, checksOf, planOf } from '@konekode/course/units';

import { expectedNow, press } from '../src/lib/edit/session';
import { generator, openAnywhere, pickFrom } from './fuzz-support';
import { arrive, expectSame, tap, type Walk } from './gate-support';
import { studentEditor } from './gate-view';
import { current, currentId, type Current } from './scene-view';
import { storedPosition } from './stored';
import { expect, test, type Page } from './test';

interface Trip {
  readonly actions: Array<string>;
  fresh: boolean;
  readonly page: Page;
  readonly random: () => number;
  walk: Walk | null;
  walkGate: string;
}

const rounds = 3;
const wandering = 45;
const patience = 400;
const beats = beatsOf('start');
const last = 'done';
const pool = String.raw`abcdefghijklmnopqrstuvwxyzGIOX$0.123<>(){};'"# `.split('');
const named = ['Escape', 'Backspace', 'Enter', 'ArrowLeft', 'ArrowDown', 'Tab'];
const drill = '[data-typing-drill]';
const programs = new Map(checksOf('start').map((check) => [check.id, check.program]));

const isGuided = (id: string): boolean => (planOf('start', id)?.path.length ?? 0) > 0;

const labelOf = (trip: Trip): string => `actions: ${trip.actions.join(' | ')}`;

const settle = async (trip: Trip, reloaded: boolean): Promise<Current> => {
  const state = await current(trip.page);
  const atGate = state.waiting && state.wait === 'run' && isGuided(state.id);
  if (!atGate) {
    Object.assign(trip, { walk: null, walkGate: '' });
    return state;
  }
  if (reloaded || trip.walk === null || trip.walkGate !== state.id) {
    await expect(trip.page.locator(studentEditor), labelOf(trip)).toBeFocused();
    Object.assign(trip, { fresh: true, walk: arrive(trip.page, state.id), walkGate: state.id });
  }
  if (trip.walk !== null && trip.fresh) {
    await expectSame(trip.walk, labelOf(trip));
  }
  trip.fresh = false;
  return state;
};

const sendKey = async (trip: Trip, key: string): Promise<void> => {
  const { page, walk } = trip;
  const state = await current(page);
  const wouldRun = state.waiting && state.wait === 'run' && key === 'Enter';
  if (walk === null && wouldRun) {
    return;
  }
  trip.actions.push(`key ${JSON.stringify(key)}`);
  if (walk === null) {
    await page.keyboard.press(key);
    return;
  }
  if (!press(walk.session, key, walk.rules).runs) {
    await tap(walk, key);
    trip.fresh = true;
  }
};

const rightKey = ({ walk }: Trip): string => {
  if (walk === null) {
    return ' ';
  }
  const expected = expectedNow(walk.session);
  if (expected === null || expected.kind === 'run') {
    return ' ';
  }
  return expected.key;
};

const acts: Record<string, (trip: Trip) => Promise<boolean>> = {
  back: async (trip) => {
    trip.actions.push('PageUp');
    await trip.page.keyboard.press('PageUp');
    return false;
  },
  click: async (trip) => {
    trip.actions.push('click the dialogue');
    await trip.page.locator('[data-role="dialogue"] .who').click();
    return false;
  },
  key: async (trip) => {
    await sendKey(trip, pickFrom(trip.random, [...pool, ...named]));
    return false;
  },
  next: async (trip) => {
    await sendKey(trip, ' ');
    return false;
  },
  onward: async (trip) => {
    trip.actions.push('PageDown');
    await trip.page.keyboard.press('PageDown');
    return false;
  },
  reload: async (trip) => {
    trip.actions.push('reload');
    await trip.page.reload();
    await trip.page.locator('[data-scene][data-ready="true"]').waitFor();
    return true;
  },
  right: async (trip) => {
    await sendKey(trip, rightKey(trip));
    return false;
  },
};

const weights: ReadonlyArray<readonly [string, number]> = [
  ['right', 30],
  ['next', 20],
  ['key', 20],
  ['back', 10],
  ['onward', 5],
  ['click', 8],
  ['reload', 7],
];

const choose = (random: () => number): string => {
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [name, weight] of weights) {
    roll -= weight;
    if (roll < 0) {
      return name;
    }
  }
  return 'next';
};

const finishDrill = async (page: Page): Promise<void> => {
  const state = await page.evaluate((selector) => {
    const root = document.querySelector<HTMLElement>(selector);
    return {
      done: root?.querySelector('[data-role="done"]')?.textContent ?? '',
      mode: root?.dataset.mode ?? '',
      target: root?.dataset.target ?? '',
    };
  }, drill);
  await expect(page.locator(`${drill} [data-role="input"]`)).toBeFocused();
  if (state.mode !== 'insert') {
    await page.keyboard.press('i');
  }
  await page.keyboard.type(state.target.slice(state.done.length));
  await page.keyboard.press('Escape');
};

const finishGate = async (trip: Trip, walk: Walk, gate: string): Promise<void> => {
  for (const expected of walk.session.path.slice(walk.session.at)) {
    if (expected.kind !== 'run') {
      await tap(walk, expected.key);
    }
  }
  await expectSame(walk, labelOf(trip));
  await trip.page.keyboard.press('Enter');
  await expect
    .poll(async () => await currentId(trip.page), { message: labelOf(trip) })
    .not.toBe(gate);
};

const finishTask = async (page: Page, gate: string): Promise<void> => {
  await expect.poll(async () => await storedPosition(page)).toBe(gate);
  await page.evaluate(
    (text) => {
      localStorage.setItem('cp:draft:start', JSON.stringify({ cursor: 0, text }));
    },
    programs.get(gate) ?? '',
  );
  await page.reload();
  await page.locator('[data-scene][data-ready="true"]').waitFor();
  await expect(page.locator(studentEditor)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(async () => await currentId(page), { timeout: 150_000 }).not.toBe(gate);
};

const stepOn = async (trip: Trip, state: Current): Promise<void> => {
  if (state.waiting && state.wait === 'drill') {
    await finishDrill(trip.page);
  } else if (trip.walk !== null) {
    await finishGate(trip, trip.walk, state.id);
  } else if (state.waiting && state.wait === 'run') {
    await finishTask(trip.page, state.id);
  } else {
    await trip.page.keyboard.press('Space');
  }
};

const finish = async (trip: Trip): Promise<string> => {
  let reloaded = false;
  for (let step = 0; step < patience; step += 1) {
    const state = await settle(trip, reloaded);
    if (state.id === last) {
      return state.id;
    }
    reloaded = state.waiting && state.wait === 'run' && trip.walk === null;
    await stepOn(trip, state);
  }
  return await currentId(trip.page);
};

test.describe('the whole unit', () => {
  test.use({ reducedMotion: 'reduce' });

  test('wherever random use leaves the learner, honest work still reaches the end', async ({
    page,
  }, info) => {
    const firstSeed = info.repeatEachIndex * rounds + 1;
    for (let seed = firstSeed; seed < firstSeed + rounds; seed += 1) {
      const random = generator(seed);
      const from = pickFrom(random, beats).id;
      const trip: Trip = {
        actions: [`seed ${String(seed)}, from ${from}`],
        fresh: false,
        page,
        random,
        walk: null,
        walkGate: '',
      };
      await openAnywhere(page, from);
      let reloaded = true;
      for (let count = 0; count < wandering; count += 1) {
        await settle(trip, reloaded);
        reloaded = (await acts[choose(random)]?.(trip)) ?? false;
      }
      await settle(trip, reloaded);
      trip.actions.push('then honestly to the end');
      expect(await finish(trip), labelOf(trip)).toBe(last);
      await expect
        .poll(async () => await storedPosition(page), { message: labelOf(trip) })
        .toBe(last);
    }
  });
});
