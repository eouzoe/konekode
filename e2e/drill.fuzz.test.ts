import { expect, test, type CDPSession, type Page } from '@playwright/test';

import {
  createDrill,
  escape,
  expectedChar,
  isDone,
  isTyped,
  press,
  type Drill,
} from '../src/lib/typing/drill';
import { generator, openAt, pickFrom } from './fuzz-support';

interface Run {
  readonly actions: string[];
  readonly ime: CDPSession | null;
  model: Drill;
  readonly page: Page;
  readonly random: () => number;
}

const gate = 'type-template';
const runs = 4;
const length = 40;
const input = '[data-typing-drill] [data-role="input"]';
const pool = String.raw`abcdefghijklmnopqrstuvwxyzIOX0123456789#<>(){};.-:' `.split('');
const named = ['Enter', 'Escape', 'Backspace', 'Delete'];
const composed = ['ㄅ', 'ㄋㄧ', '`', 'ｃ'];
const committed = ['八', '你好', '；', '#include'];

const wanted = (model: Drill): string => {
  if (isTyped(model)) {
    return 'Escape';
  }
  if (model.mode === 'normal') {
    return 'i';
  }
  const char = expectedChar(model);
  if (char === '\n') {
    return 'Enter';
  }
  return char;
};

const after = (model: Drill, key: string): Drill => {
  if (key === 'Escape') {
    return escape(model);
  }
  if (key === 'Enter') {
    return press(model, '\n');
  }
  if (key.length === 1) {
    return press(model, key);
  }
  return model;
};

const tap = async (run: Run, key: string): Promise<void> => {
  run.actions.push(`key ${JSON.stringify(key)}`);
  run.model = after(run.model, key);
  await run.page.keyboard.press(key);
};

const acts: Record<string, (run: Run) => Promise<void>> = {
  blur: async (run) => {
    run.actions.push('blur and click back');
    await run.page.locator(input).blur();
    await run.page.locator('[data-typing-drill]').click();
  },
  compose: async (run) => {
    const text = pickFrom(run.random, composed);
    run.actions.push(`compose ${text}`);
    await run.ime?.send('Input.imeSetComposition', {
      selectionEnd: text.length,
      selectionStart: text.length,
      text,
    });
    await run.ime?.send('Input.imeSetComposition', {
      selectionEnd: 0,
      selectionStart: 0,
      text: '',
    });
  },
  insert: async (run) => {
    const text = pickFrom(run.random, committed);
    run.actions.push(`insert ${text}`);
    await run.ime?.send('Input.insertText', { text });
    for (const char of text) {
      run.model = after(run.model, char);
    }
  },
  right: async (run) => {
    await tap(run, wanted(run.model));
  },
  shift: async (run) => {
    run.actions.push('tap Shift');
    await run.page.keyboard.press('Shift');
  },
  wrong: async (run) => {
    await tap(run, pickFrom(run.random, [...pool, ...named]));
  },
};

const weights: readonly (readonly [string, number])[] = [
  ['right', 45],
  ['wrong', 25],
  ['compose', 8],
  ['insert', 6],
  ['shift', 6],
  ['blur', 10],
];

const choose = (run: Run): string => {
  const usable = weights.filter(
    ([name]) => run.ime !== null || (name !== 'compose' && name !== 'insert'),
  );
  const total = usable.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = run.random() * total;
  for (const [name, weight] of usable) {
    roll -= weight;
    if (roll < 0) {
      return name;
    }
  }
  return 'right';
};

const mismatch = async (run: Run): Promise<string> => {
  const now = await run.page.evaluate(() => {
    const drill = document.querySelector<HTMLElement>('[data-typing-drill]');
    return {
      done: drill?.querySelector('[data-role="done"]')?.textContent ?? '',
      mode: drill?.dataset.mode ?? '',
    };
  });
  const want = { done: run.model.target.slice(0, run.model.position), mode: run.model.mode };
  if (now.done === want.done && now.mode === want.mode) {
    return '';
  }
  return JSON.stringify({ now, want });
};

const expectSettled = async (run: Run, label: string): Promise<void> => {
  await expect.poll(async () => await mismatch(run), { message: label, timeout: 3000 }).toBe('');
};

const imeOf = async (page: Page, browserName: string): Promise<CDPSession | null> => {
  if (browserName !== 'chromium') {
    return null;
  }
  return await page.context().newCDPSession(page);
};

const finish = async (run: Run, label: string): Promise<void> => {
  while (!isDone(run.model)) {
    await tap(run, wanted(run.model));
    if (!isDone(run.model)) {
      await expectSettled(run, label);
    }
  }
};

test('random input at the typing drill never leaves what the drill describes', async ({
  browserName,
  page,
}, info) => {
  test.setTimeout(180_000);
  const ime = await imeOf(page, browserName);
  const firstSeed = info.repeatEachIndex * runs + 1;
  for (let seed = firstSeed; seed < firstSeed + runs; seed += 1) {
    await openAt(page, gate, input);
    const target = await page.locator('[data-typing-drill]').getAttribute('data-target');
    const run: Run = {
      actions: [],
      ime,
      model: createDrill(target ?? ''),
      page,
      random: generator(seed),
    };
    const label = (): string => `seed ${String(seed)}, actions: ${run.actions.join(' | ')}`;
    for (let count = 0; count < length && !isDone(run.model); count += 1) {
      await acts[choose(run)]?.(run);
      if (!isDone(run.model)) {
        await expectSettled(run, label());
      }
    }
    await finish(run, label());
    await expect
      .poll(async () => await page.locator('[data-scene]').getAttribute('data-waiting'), {
        message: label(),
      })
      .not.toBe('true');
  }
});
