import { expect, test, type CDPSession, type Page } from '@playwright/test';

import { expand, type Expected } from '../src/lib/run/guide';
import { messages } from '../src/lib/typing/messages';
import { checksOf, pathFor } from '../src/units/index';
import { generator, openAt, pickFrom } from './fuzz-support';

interface Shown {
  readonly hint: string;
  readonly mode: string;
  readonly text: string;
}

interface Run {
  readonly actions: string[];
  at: number;
  readonly ime: CDPSession | null;
  readonly page: Page;
  readonly random: () => number;
  readonly reference: readonly Shown[];
  readonly steps: readonly Expected[];
}

const unit = 'start';
const gates = ['run-cout', 'run-two', 'run-newline', 'run-int', 'run-cin'];
const runs = 4;
const length = 30;
const editor = '[data-code-runner] [data-role="editor"] .cm-content';
const named = ['Enter', 'Escape', 'Backspace', 'Delete', 'Tab'];
const plain = String.raw`abcdefghijklmnopqrstuvwxyzGOXDZ0123456789$.;<>{}#'\ `.split('');
const pool = [...plain, ...named];
const composed = ['ㄅ', 'ㄋㄧ', 'ㄏㄠ', '`', 'ｃ'];
const committed = ['八', '你好', '；', 'x', 'cout'];

const pick = <Item>(run: Run, items: readonly Item[]): Item => pickFrom(run.random, items);

const openGate = async (page: Page, gate: string): Promise<void> => {
  await openAt(page, gate, editor);
};

const shown = async (page: Page): Promise<Shown> =>
  await page.evaluate(() => {
    const runner = document.querySelector('[data-code-runner]');
    const lines = [...(runner?.querySelectorAll('[data-role="editor"] .cm-line') ?? [])];
    return {
      hint: runner?.querySelector('[data-role="hint"]')?.textContent ?? '',
      mode: runner?.querySelector('[data-role="editor"] .cm-vim-panel')?.textContent ?? '',
      text: lines.map((line) => line.textContent).join('\n'),
    };
  });

const stepsOf = (gate: string): Expected[] => expand(pathFor(unit, gate));

const walkClean = async (page: Page, gate: string): Promise<Shown[]> => {
  const steps = stepsOf(gate);
  const reference: Shown[] = [];
  await openGate(page, gate);
  for (const step of steps.slice(0, -1)) {
    reference.push(await shown(page));
    await page.keyboard.press(step.key);
  }
  reference.push(await shown(page));
  return reference;
};

const mismatch = (run: Run, now: Shown): string => {
  const want = run.reference[run.at];
  if (want === undefined) {
    return 'no reference for this step';
  }
  const hints = [want.hint, `${messages.wrong}${want.hint}`, messages.ime, messages.fullWidth];
  if (now.text === want.text && now.mode === want.mode && hints.includes(now.hint)) {
    return '';
  }
  return JSON.stringify({ now, want });
};

const describeRun = (run: Run, seed: number, gate: string): string =>
  `gate ${gate}, seed ${String(seed)}, step ${String(run.at)}, actions: ${run.actions.join(' | ')}`;

const press = async (run: Run, key: string): Promise<void> => {
  const expected = run.steps[run.at];
  if (expected?.kind === 'run' && key === expected.key) {
    return;
  }
  run.actions.push(`key ${JSON.stringify(key)}`);
  if (expected?.key === key) {
    run.at += 1;
  }
  await run.page.keyboard.press(key);
};

const acts: Record<string, (run: Run) => Promise<void>> = {
  blur: async (run) => {
    run.actions.push('blur and click back');
    await run.page.locator(editor).blur();
    await run.page.locator(editor).click();
  },
  burst: async (run) => {
    await press(run, run.steps[run.at]?.key ?? 'q');
    await press(run, run.steps[run.at]?.key ?? 'q');
  },
  click: async (run) => {
    run.actions.push('click');
    const box = await run.page.locator(editor).boundingBox();
    const left = (box?.x ?? 0) + run.random() * (box?.width ?? 1);
    const top = (box?.y ?? 0) + run.random() * (box?.height ?? 1);
    await run.page.mouse.click(left, top);
  },
  compose: async (run) => {
    const text = pick(run, composed);
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
    const text = pick(run, committed);
    run.actions.push(`insert ${text}`);
    await run.ime?.send('Input.insertText', { text });
  },
  right: async (run) => {
    await press(run, run.steps[run.at]?.key ?? 'q');
  },
  shift: async (run) => {
    run.actions.push('tap Shift');
    await run.page.keyboard.press('Shift');
  },
  wrong: async (run) => {
    await press(run, pick(run, pool));
  },
};

const weights: readonly (readonly [string, number])[] = [
  ['right', 30],
  ['wrong', 30],
  ['compose', 10],
  ['insert', 6],
  ['shift', 6],
  ['click', 6],
  ['blur', 6],
  ['burst', 6],
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

const expectSettled = async (run: Run, label: string): Promise<void> => {
  await expect
    .poll(async () => mismatch(run, await shown(run.page)), { message: label, timeout: 3000 })
    .toBe('');
};

const finish = async (run: Run, label: string): Promise<void> => {
  while (run.at < run.steps.length - 1) {
    await press(run, run.steps[run.at]?.key ?? 'q');
    await expectSettled(run, label);
  }
};

const imeOf = async (page: Page, browserName: string): Promise<CDPSession | null> => {
  if (browserName !== 'chromium') {
    return null;
  }
  return await page.context().newCDPSession(page);
};

for (const gate of gates) {
  test(`random input at ${gate} never leaves what the hints describe`, async ({
    browserName,
    page,
  }, info) => {
    test.setTimeout(60_000 + runs * length * 400);
    const steps = stepsOf(gate);
    const reference = await walkClean(page, gate);
    const goal = checksOf(unit).find((check) => check.id === gate)?.program ?? '';
    expect(reference.at(-1)?.text).toBe(goal);
    const ime = await imeOf(page, browserName);
    const firstSeed = info.repeatEachIndex * runs + 1;
    for (let seed = firstSeed; seed < firstSeed + runs; seed += 1) {
      const run: Run = { actions: [], at: 0, ime, page, random: generator(seed), reference, steps };
      await openGate(page, gate);
      for (let count = 0; count < length; count += 1) {
        await acts[choose(run)]?.(run);
        await expectSettled(run, describeRun(run, seed, gate));
      }
      await finish(run, describeRun(run, seed, gate));
      const end = await shown(page);
      expect(end.text, describeRun(run, seed, gate)).toBe(goal);
      expect(end.hint.endsWith(messages.runNow), describeRun(run, seed, gate)).toBe(true);
    }
  });
}
