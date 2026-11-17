import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { generator, inputMethod, openAt, pickFrom, slowEveryOtherRound } from './fuzz-support';

interface Run {
  readonly actions: string[];
  readonly ime: CDPSession | null;
  readonly page: Page;
  readonly random: () => number;
}

const gate = 'task';
const runs = 3;
const length = 40;
const editor = '[data-code-runner] [data-role="editor"] .cm-content';
const runner = '[data-code-runner]';
const pool = String.raw`abcdefghijklmnopqrstuvwxyzGOXDZ0123456789$.;<>{}#'\ `.split('');
const named = ['Enter', 'Escape', 'Backspace', 'Delete', 'Tab'];
const composed = ['ㄅ', 'ㄋㄧ', '`', 'ｃ'];
const committed = ['八', '你好', '；', 'x'];
const finished = /執行完成|編譯沒有過|執行時出錯|程式中途結束|跑太久|執行不了/u;
const marker = 'int z{};';

const acts: Record<string, (run: Run) => Promise<void>> = {
  blur: async (run) => {
    run.actions.push('blur and click back');
    await run.page.locator(editor).blur();
    await run.page.locator(editor).click();
  },
  compose: async (run) => {
    const text = pickFrom(run.random, composed);
    run.actions.push(`compose ${text}`);
    await run.ime?.send('Input.imeSetComposition', {
      selectionEnd: text.length,
      selectionStart: text.length,
      text,
    });
    if (run.random() < 0.5) {
      run.actions.push('cancel');
      await run.ime?.send('Input.imeSetComposition', {
        selectionEnd: 0,
        selectionStart: 0,
        text: '',
      });
    }
  },
  insert: async (run) => {
    const text = pickFrom(run.random, committed);
    run.actions.push(`insert ${text}`);
    await run.ime?.send('Input.insertText', { text });
  },
  key: async (run) => {
    const key = pickFrom(run.random, [...pool, ...named]);
    run.actions.push(`key ${JSON.stringify(key)}`);
    await run.page.keyboard.press(key);
  },
  shift: async (run) => {
    run.actions.push('tap Shift');
    await run.page.keyboard.press('Shift');
  },
};

const weights: readonly (readonly [string, number])[] = [
  ['key', 70],
  ['compose', 10],
  ['insert', 6],
  ['shift', 6],
  ['blur', 8],
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
  return 'key';
};

const stillWorks = async (run: Run, label: string): Promise<void> => {
  const { page } = run;
  const mode = page.locator(`${runner} [data-role="editor"] .cm-vim-panel`);
  await expect(page.locator(runner), label).not.toHaveAttribute('data-state', 'busy', {
    timeout: 150_000,
  });
  await page.locator(editor).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(mode, label).toHaveText('--NORMAL--');
  await page.keyboard.press('G');
  await page.keyboard.press('O');
  await expect(mode, label).toHaveText('--INSERT--');
  await page.keyboard.type(marker);
  await expect(page.locator(editor), label).toContainText(marker);
  await page.keyboard.press('Escape');
  await expect(mode, label).toHaveText('--NORMAL--');
  await page.keyboard.press('Enter');
  await expect(page.locator(`${runner} [data-role="status"]`), label).toHaveText(finished, {
    timeout: 150_000,
  });
};

test('random input at the free gate never leaves the editor stuck', async ({
  browserName,
  page,
}, info) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  const ime = await inputMethod(page, browserName);
  await slowEveryOtherRound(ime, info.repeatEachIndex);
  const firstSeed = info.repeatEachIndex * runs + 1;
  for (let seed = firstSeed; seed < firstSeed + runs; seed += 1) {
    await openAt(page, gate, editor);
    const run: Run = { actions: [], ime, page, random: generator(seed) };
    for (let count = 0; count < length; count += 1) {
      await acts[choose(run)]?.(run);
    }
    const label = `seed ${String(seed)}, actions: ${run.actions.join(' | ')}`;
    expect(await page.locator('[data-scene]').getAttribute('data-waiting'), label).toBe('true');
    await stillWorks(run, label);
    expect(errors, label).toEqual([]);
  }
});
