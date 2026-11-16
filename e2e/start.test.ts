import { expect, test, type Page } from '@playwright/test';
import { createActor } from 'xstate';
import { array, object, string } from 'zod';

import { beatSchema, sceneMachine, type BeatMeta } from '../src/lib/scene/machine';

interface Current {
  readonly id: string;
  readonly revealing: boolean;
  readonly wait: string;
  readonly waiting: boolean;
}

const path = '/learn/start/';
const studentEditor = '[data-role="editor"] .cm-content';
const spriteEditor = '[data-role="sprite-editor"] .cm-content';
const unitName = 'start';
const seedPath = '/favicon.ico';

let visits = 0;

const openSeed = async (page: Page): Promise<void> => {
  visits += 1;
  await page.goto(`${seedPath}?visit=${String(visits)}`);
};
const storedEvent = object({ kind: string(), ref: string() });
const storedEvents = array(storedEvent);
const template = [
  '#include <bits/stdc++.h>',
  'using namespace std;',
  '',
  'int main()',
  '{',
  'cin.tie(nullptr)->sync_with_stdio(false);',
  '}',
].join('\n');

const wrap = (body: string): string =>
  [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    'int main()',
    '{',
    '    cin.tie(nullptr)->sync_with_stdio(false);',
    body,
    '}',
  ].join('\n');

const programs: Record<string, string> = {
  'run-cin': wrap("    int a{};\n    cin >> a;\n    cout << a << '\\n';"),
  'run-cout': wrap('    cout << 11;'),
  'run-int': wrap("    int a{11};\n    cout << a << '\\n';"),
  'run-newline': wrap("    cout << 11 << '\\n';\n    cout << 22 << '\\n';"),
  'run-two': wrap('    cout << 11;\n    cout << 22;'),
  task: wrap(
    "    int a{};\n    int b{};\n    cin >> a >> b;\n    cout << b << '\\n';\n    cout << a << '\\n';",
  ),
};

type Act = readonly [kind: 'keys' | 'type', value: string];

const lessons: Record<string, readonly Act[]> = {
  'run-cin': [
    ['keys', 'k 0 f 1 x x o'],
    ['type', 'cin >> a;'],
    ['keys', 'Escape Enter'],
  ],
  'run-cout': [
    ['keys', 'G O'],
    ['type', 'cout << 11;'],
    ['keys', 'Escape Enter'],
  ],
  'run-int': [
    ['keys', 'd j O'],
    ['type', 'int a{11};'],
    ['keys', 'Enter'],
    ['type', String.raw`cout << a << '\n';`],
    ['keys', 'Escape Enter'],
  ],
  'run-newline': [
    ['keys', '$ i'],
    ['type', String.raw` << '\n'`],
    ['keys', 'Escape k $ . Enter'],
  ],
  'run-two': [
    ['keys', 'o'],
    ['type', 'cout << 22;'],
    ['keys', 'Escape Enter'],
  ],
};

const current = async (page: Page): Promise<Current> =>
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-scene][data-ready="true"]');
    const beat = [...(root?.querySelectorAll<HTMLElement>('[data-beat]:not([hidden])') ?? [])].at(
      -1,
    );
    return {
      id: beat?.dataset.id ?? '',
      revealing: root?.dataset.revealing === 'true',
      wait: beat?.dataset.wait ?? '',
      waiting: root?.dataset.waiting === 'true',
    };
  });

const currentId = async (page: Page): Promise<string> => (await current(page)).id;

interface Saved {
  readonly cursor: number;
  readonly text: string;
}

interface Setup {
  readonly draft?: Saved;
  readonly unlocked?: readonly string[];
}

const draftAt = (text: string, needle: string): Saved => ({ cursor: text.indexOf(needle), text });

const open = async (
  page: Page,
  position: string | null = null,
  setup: Setup = {},
): Promise<void> => {
  await openSeed(page);
  await page.evaluate(
    async ({ ids, ref, saved, unit }) => {
      localStorage.clear();
      if (saved !== null) {
        localStorage.setItem('cp:draft:start', JSON.stringify(saved));
      }
      await new Promise<null>((resolve) => {
        const removal = indexedDB.deleteDatabase('konekode');
        for (const name of ['success', 'error', 'blocked']) {
          removal.addEventListener(name, () => {
            resolve(null);
          });
        }
      });
      const make = (kind: string, target: string, at: number): object => ({
        at,
        device: 'e2e',
        id: `e2e-${String(at)}`,
        kind,
        ref: target,
        unit,
        version: 1,
      });
      const events = ids.map((id, index) => make('item.unlocked', id, index + 1));
      if (ref !== null) {
        events.push(make('beat.reached', ref, ids.length + 1));
      }
      localStorage.setItem('cp:events:v1', JSON.stringify(events));
    },
    { ids: [...(setup.unlocked ?? [])], ref: position, saved: setup.draft ?? null, unit: unitName },
  );
  await page.goto(path);
  await page.locator('[data-scene][data-ready="true"]').waitFor();
};

const writeProgram = async (page: Page, source: string): Promise<void> => {
  await page.locator(studentEditor).click();
  await page.keyboard.press('Escape');
  await page.keyboard.type('ggdGi');
  await page.keyboard.insertText(source);
  await page.keyboard.press('Escape');
};

const status = (page: Page) => page.locator('[data-code-runner] [data-role="status"]');
const output = (page: Page) => page.locator('[data-code-runner] [data-role="output"]');

const typeTemplate = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-typing-drill] [data-role="input"]')).toBeFocused();
  await page.keyboard.type(`i${template}`);
  await page.keyboard.press('Escape');
};

const follow = async (page: Page, acts: readonly Act[]): Promise<void> => {
  for (const [kind, value] of acts) {
    if (kind === 'type') {
      await page.keyboard.type(value);
    } else {
      for (const key of value.split(' ')) {
        await page.keyboard.press(key);
      }
    }
  }
};

const solve = async (page: Page, gate: string): Promise<void> => {
  const acts = lessons[gate];
  if (acts === undefined) {
    await writeProgram(page, programs[gate] ?? '');
    await page.keyboard.press('Enter');
    return;
  }
  await expect(page.locator(studentEditor)).toBeFocused();
  await follow(page, acts);
};

const editorText = async (page: Page, owner = studentEditor): Promise<string> =>
  await page.evaluate(
    (selector) =>
      [...document.querySelectorAll(`${selector} .cm-line`)]
        .map((line) => line.textContent ?? '')
        .join('\n'),
    owner,
  );

const advance = async (page: Page, state: Current): Promise<void> => {
  if (state.waiting && state.wait === 'drill') {
    await typeTemplate(page);
    return;
  }
  if (state.waiting && state.wait === 'run') {
    await solve(page, state.id);
    await expect.poll(async () => await currentId(page), { timeout: 150_000 }).not.toBe(state.id);
    return;
  }
  await page.keyboard.press('Space');
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

test.describe('起步單元', () => {
  test.use({ reducedMotion: 'reduce' });

  test('載入後只顯示第一句，其餘藏起來', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-beat]:not([hidden])')).toHaveCount(1);
    expect(await currentId(page)).toBe('fullscreen-ask');
    const hiddenBeforeReady = await page.evaluate(() => {
      const scene = document.querySelector<HTMLElement>('[data-scene]');
      if (scene === null) {
        return '';
      }
      delete scene.dataset.ready;
      const { visibility } = getComputedStyle(scene);
      scene.dataset.ready = 'true';
      return visibility;
    });
    expect(hiddenBeforeReady).toBe('hidden');
  });

  test('台詞裡沒有跑出編碼，長句會換行', async ({ page }) => {
    await open(page);
    const says = await page.locator('[data-beat]').allTextContents();
    expect(says.filter((say) => say.includes(String.raw`\u`))).toEqual([]);
    expect(says.some((say) => say.includes(String.raw`'\n'`))).toBe(true);
    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(fits).toBe(true);
  });

  test('不是全螢幕時，按鍵後說「好吧」', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('fullscreen-no');
  });

  test('功能鍵不會換句', async ({ page }) => {
    await open(page);
    for (const key of ['F11', 'F5', 'Tab', 'Shift', 'Control']) {
      if (key !== 'F5') {
        await page.keyboard.press(key);
      }
    }
    expect(await currentId(page)).toBe('fullscreen-ask');
  });

  test('亂按往前往回，頁面和狀態機一致', async ({ page }) => {
    await open(page);
    const metas = await readMetas(page);
    const limit = metas.findIndex((meta) => meta.id === 'line-include');
    const model = createActor(sceneMachine, {
      input: { beats: metas, passed: [], position: null },
    });
    model.start();
    model.send({ type: 'REVEALED' });
    let seed = 20_261_115;
    for (let step = 0; step < 60; step += 1) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      const forward = seed % 10 < 6 && model.getSnapshot().context.index < limit;
      if (forward) {
        model.send({ full: false, type: 'NEXT' });
        await page.keyboard.press('Space');
      } else {
        model.send({ full: false, type: 'BACK' });
        await page.keyboard.press('ArrowLeft');
      }
      model.send({ type: 'REVEALED' });
      const wanted = metas[model.getSnapshot().context.index]?.id ?? '';
      expect(await currentId(page), `第 ${String(step)} 步`).toBe(wanted);
    }
  });

  test('打字區的鍵盤不會被對話框擋住', async ({ page }) => {
    await page.setViewportSize({ height: 720, width: 1280 });
    await open(page, 'shift-combo');
    const boxes = await page.evaluate(() => {
      const keyboard = document.querySelector('.keyboard')?.getBoundingClientRect();
      const dialogue = document.querySelector('.dialogue')?.getBoundingClientRect();
      return { dialogueTop: dialogue?.top ?? 0, keyboardBottom: keyboard?.bottom ?? 0 };
    });
    expect(boxes.keyboardBottom).toBeGreaterThan(0);
    expect(boxes.keyboardBottom).toBeLessThanOrEqual(boxes.dialogueTop);
  });

  test('寫錯會顯示編譯沒有過，無窮迴圈會被停下來', async ({ page }) => {
    await open(page, 'run-cout');
    await writeProgram(page, wrap('    cout << 11'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('編譯沒有過', { timeout: 150_000 });
    await expect(output(page)).toContainText('行的最後面少了分號');
    expect(await currentId(page)).toBe('run-cout');
    await writeProgram(page, wrap('    while (true) {\n    }'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('跑太久，已經停下來', { timeout: 60_000 });
    await writeProgram(page, wrap('    cout << 33;'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('執行完成', { timeout: 60_000 });
    await expect(page.locator('[data-role="note"]')).not.toBeEmpty();
    expect(await currentId(page)).toBe('run-cout');
  });

  test('不是輪到學生時不能執行也不能改，Enter 就是下一句', async ({ page }) => {
    await open(page, 'do-things');
    const button = page.locator('[data-code-runner] [data-role="run"]');
    const editor = page.locator(studentEditor);
    await expect(button).toBeDisabled();
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await page.keyboard.press('Enter');
    expect(await currentId(page)).toBe('editor');
    await expect(status(page)).toBeEmpty();
  });

  test('輪到學生時，焦點不在編輯器按 Enter 也會執行', async ({ page }) => {
    await open(page, 'run-cout');
    const button = page.locator('[data-code-runner] [data-role="run"]');
    await expect(button).toBeEnabled();
    await expect(page.locator(studentEditor)).toHaveAttribute('contenteditable', 'true');
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('執行完成', { timeout: 150_000 });
    expect(await currentId(page)).toBe('run-cout');
  });

  test('示範的提示與按鍵高亮，只在講到的那一句出現', async ({ page }) => {
    const hint = page.locator('[data-typing-drill] [data-role="hint"]');
    const lit = page.locator('[data-typing-drill] .key[data-next="true"]');
    const mode = page.locator('[data-typing-drill] [data-role="mode"]');
    await open(page, 'normal-readonly');
    await expect(hint).toBeEmpty();
    await expect(lit).toHaveCount(0);
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('press-i');
    await expect(hint).toHaveText('按 i 進入輸入模式');
    await expect(lit).toHaveText(['I']);
    await expect(mode).toHaveText('-- NORMAL --');
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('insert-is');
    await expect(mode).toHaveText('-- INSERT --');
    await expect(hint).toBeEmpty();
    await expect(lit).toHaveCount(0);
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('shift-combo');
    await expect(hint).toContainText('Shift');
    await expect(lit).toHaveCount(3);
  });

  test('還沒解鎖的成對符號不會補，解鎖後才會', async ({ page }) => {
    const auto = page.locator('[data-typing-drill] .is-auto');
    const typing = page.locator('[data-typing-drill] [data-role="input"]');
    const editor = page.locator(studentEditor);
    await open(page, 'type-template');
    await expect(typing).toBeFocused();
    await page.keyboard.type('i#include <');
    await expect(auto).toHaveCount(0);
    await open(page, 'type-template', {
      unlocked: ['pair.include-angle', 'pair.paren', 'pair.brace'],
    });
    await expect(typing).toBeFocused();
    await page.keyboard.type('i#include <');
    await expect(auto).toHaveText(['>']);
    await open(page, 'run-cout');
    await expect(editor).toBeFocused();
    await page.keyboard.press('o');
    await page.keyboard.type('int a{');
    await expect(editor).toContainText('int a{');
    await expect(editor).not.toContainText('int a{}');
    await open(page, 'run-cout', { unlocked: ['pair.brace'] });
    await expect(editor).toBeFocused();
    await page.keyboard.press('o');
    await page.keyboard.type('int a{');
    await expect(editor).toContainText('int a{}');
  });

  test('pairs unlock only after the learner has typed the template by hand', async ({ page }) => {
    await open(page, 'type-template');
    const unlockedNow = async (): Promise<Set<string>> => {
      const value: unknown = await page.evaluate(
        async () =>
          await new Promise<unknown>((resolve, reject) => {
            const opening = indexedDB.open('konekode');
            opening.addEventListener('error', () => {
              reject(new Error('開不了資料庫'));
            });
            opening.addEventListener('success', () => {
              const all = opening.result.transaction('events').objectStore('events').getAll();
              all.addEventListener('success', () => {
                resolve(all.result);
              });
            });
          }),
      );
      const events = storedEvents.parse(value).filter((event) => event.kind === 'item.unlocked');
      return new Set(events.map((event) => event.ref));
    };
    const wanted = new Set(['pair.brace', 'pair.include-angle', 'pair.paren']);
    expect(await unlockedNow()).toEqual(new Set());
    await page.keyboard.type('i#include <');
    await expect(page.locator('[data-typing-drill] .is-auto')).toHaveCount(0);
    await page.keyboard.type(template.slice('#include <'.length));
    await page.keyboard.press('Escape');
    expect(await unlockedNow()).toEqual(new Set());
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('do-things');
    await expect.poll(unlockedNow).toEqual(wanted);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await expect.poll(unlockedNow).toEqual(wanted);
  });

  test('輪到學生時焦點自動進編輯器，只用鍵盤就能過第一關', async ({ page }) => {
    await open(page, 'run-cout');
    await expect(page.locator(studentEditor)).toBeFocused();
    for (const key of ['G', 'O']) {
      await page.keyboard.press(key);
    }
    await page.keyboard.type('cout << 11;');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect.poll(async () => await currentId(page), { timeout: 150_000 }).toBe('saw-output');
    await expect(page.locator(studentEditor)).not.toBeFocused();
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('arrows-out');
  });

  test('小精靈在自己的編輯器裡示範，學生的編輯器沒有被動過', async ({ page }) => {
    await open(page, 'semicolon');
    const sprite = page.locator(spriteEditor);
    const student = page.locator(studentEditor);
    await expect(sprite).toBeVisible();
    await expect(student).toBeHidden();
    await expect
      .poll(async () => (await editorText(page, spriteEditor)).split('\n'), { timeout: 15_000 })
      .toContain('    cout << 11;');
    expect(await editorText(page)).not.toContain('cout << 11;');
    await page.keyboard.press('ArrowLeft');
    expect(await currentId(page)).toBe('indent');
    await expect(sprite).not.toContainText('cout << 11;');
    for (let step = 0; step < 6 && (await currentId(page)) !== 'run-cout'; step += 1) {
      await page.keyboard.press('Space');
    }
    expect(await currentId(page)).toBe('run-cout');
    await expect(student).toBeVisible();
    await expect(sprite).toBeHidden();
    await expect(student).toBeFocused();
    expect(await editorText(page)).not.toContain('cout << 11;');
  });

  test('小精靈示範完之後，學生按 . 不會重做小精靈做過的事', async ({ page }) => {
    const mine = programs['run-two'] ?? '';
    await open(page, 'repeat', { draft: draftAt(mine, 'cout << 22;') });
    await expect
      .poll(async () => await editorText(page, spriteEditor), { timeout: 30_000 })
      .toBe(programs['run-newline'] ?? '');
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('run-newline');
    await expect(page.locator(studentEditor)).toBeFocused();
    await page.keyboard.press('.');
    await page.keyboard.press('Escape');
    expect(await editorText(page)).toBe(mine);
  });

  test('示範時會依序顯示小精靈按的每一個鍵', async ({ page }) => {
    await page.addInitScript(() => {
      const shown: string[] = [];
      Object.assign(globalThis, { shownKeys: shown });
      document.addEventListener('DOMContentLoaded', () => {
        const keycap = document.querySelector('[data-code-runner] [data-role="keycap"]');
        if (keycap === null) {
          return;
        }
        const note = (): void => {
          const text = keycap.textContent ?? '';
          if (text !== '') {
            shown.push(text);
          }
        };
        note();
        new MutationObserver(note).observe(keycap, {
          characterData: true,
          childList: true,
          subtree: true,
        });
      });
    });
    await open(page, 'go-end');
    const read = async (): Promise<string> =>
      await page.evaluate(() => {
        const keys: unknown = Reflect.get(globalThis, 'shownKeys');
        if (!Array.isArray(keys)) {
          return '';
        }
        return keys.join('');
      });
    await expect.poll(read, { timeout: 15_000 }).toBe('G');
    await expect(page.locator('[data-code-runner] [data-role="keycap"]')).toBeEmpty();
  });

  test('小精靈示範的執行結果不會被算成學生過關', async ({ page }) => {
    await open(page, 'what-run');
    await expect(status(page)).not.toBeEmpty({ timeout: 30_000 });
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('run-cout');
    await expect(page.locator(studentEditor)).toBeFocused();
    await expect(page.locator(studentEditor)).not.toContainText('cout << 11;');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('執行完成', { timeout: 150_000 });
    await expect(output(page)).toBeEmpty();
    await expect(page.locator('[data-role="note"]')).not.toBeEmpty();
    expect(await currentId(page)).toBe('run-cout');
  });

  test('每一關沒有真的完成就不能往下', async ({ page }) => {
    for (const gate of ['type-template', ...Object.keys(programs)]) {
      await open(page, gate);
      for (const key of ['Space', 'ArrowRight', 'ArrowDown', 'Enter', 'Space']) {
        await page.keyboard.press(key);
      }
      if (gate !== 'type-template') {
        await expect
          .poll(
            async () =>
              `${(await status(page).textContent()) ?? ''}｜${(await output(page).textContent()) ?? ''}`,
            { message: gate, timeout: 150_000 },
          )
          .toBe('執行完成｜');
      }
      expect(await currentId(page), gate).toBe(gate);
    }
  });

  test('full-width input gets its own hint and types nothing', async ({ page }) => {
    const hint = page.locator('[data-typing-drill] [data-role="hint"]');
    const mode = page.locator('[data-typing-drill] [data-role="mode"]');
    const done = page.locator('[data-typing-drill] [data-role="done"]');
    await open(page, 'type-template');
    await expect(page.locator('[data-typing-drill] [data-role="input"]')).toBeFocused();
    await expect(page.locator('[data-typing-drill] .drill-tip')).toContainText('半形');
    await page.keyboard.insertText('ｉ');
    await expect(hint).toContainText('全形');
    await expect(mode).toHaveText('-- NORMAL --');
    await page.keyboard.press('i');
    await expect(mode).toHaveText('-- INSERT --');
    await page.keyboard.insertText('＃');
    await expect(hint).toContainText('全形');
    await expect(done).toHaveText('');
    await page.keyboard.press('#');
    await expect(done).toHaveText('#');
    await expect(hint).not.toContainText('全形');
  });

  test('小精靈的示範打完時，不會出現稱讚學生的話', async ({ page }) => {
    const hint = page.locator('[data-typing-drill] [data-role="hint"]');
    await open(page, 'type-template');
    await expect(page.locator('[data-typing-drill] [data-role="input"]')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    expect(await currentId(page)).toBe('press-esc');
    await expect(page.locator('[data-typing-drill] [data-role="mode"]')).toHaveText(
      '-- NORMAL --',
      {
        timeout: 15_000,
      },
    );
    await expect(hint).toBeEmpty();
    await page.keyboard.press('ArrowRight');
    expect(await currentId(page)).toBe('type-template');
    await expect(hint).toHaveText('按 i 進入輸入模式');
  });

  test('小精靈每一段示範做出來的程式，和要學生做的一模一樣', async ({ page }) => {
    const first = programs['run-cout'] ?? '';
    const second = programs['run-two'] ?? '';
    const third = programs['run-newline'] ?? '';
    const fourth = programs['run-int'] ?? '';
    const cases: readonly [
      beat: string,
      draft: { cursor: number; text: string },
      wanted: string,
    ][] = [
      ['type-second', draftAt(first, 'cout << 11;'), second],
      ['repeat', draftAt(second, 'cout << 22;'), third],
      ['retype', draftAt(third, 'cout << 11'), fourth],
      ['add-cin', draftAt(fourth, 'cout << a'), programs['run-cin'] ?? ''],
    ];
    for (const [beat, draft, wanted] of cases) {
      await open(page, beat, { draft, unlocked: ['pair.paren', 'pair.brace'] });
      await expect
        .poll(async () => await editorText(page, spriteEditor), { message: beat, timeout: 30_000 })
        .toBe(wanted);
    }
  });

  test('示範播到一半重新整理，學生自己的程式不會被示範的內容蓋掉', async ({ page }) => {
    const mine = programs['run-two'] ?? '';
    await open(page, 'semicolon', { draft: draftAt(mine, 'cout << 22;') });
    await expect
      .poll(async () => (await editorText(page, spriteEditor)).split('cout << 11;').length, {
        timeout: 20_000,
      })
      .toBeGreaterThan(2);
    await page.reload();
    await page.locator('[data-scene][data-ready="true"]').waitFor();
    for (let step = 0; step < 4 && (await currentId(page)) !== 'run-cout'; step += 1) {
      await page.keyboard.press('Space');
    }
    expect(await currentId(page)).toBe('run-cout');
    await expect.poll(async () => await editorText(page)).toBe(mine);
  });

  test('從第一句走到最後一句，每個關卡都能過', async ({ page }) => {
    await open(page);
    const seen: string[] = [];
    for (let step = 0; step < 300; step += 1) {
      const state = await current(page);
      if (seen.at(-1) !== state.id) {
        seen.push(state.id);
      }
      if (state.id === 'done') {
        break;
      }
      await advance(page, state);
    }
    expect(seen.at(-1)).toBe('done');
    for (const gate of ['type-template', ...Object.keys(programs)]) {
      expect(seen).toContain(gate);
    }
    await page.reload();
    await page.locator('[data-scene][data-ready="true"]').waitFor();
    expect(await currentId(page)).toBe('done');
  });
});

test.describe('有動態效果時', () => {
  test('文字逐字出現，按一下先顯示完整句，再按才換句', async ({ page }) => {
    await open(page);
    expect((await current(page)).revealing).toBe(true);
    await page.keyboard.press('Space');
    const shown = await current(page);
    expect(shown.id).toBe('fullscreen-ask');
    expect(shown.revealing).toBe(false);
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('fullscreen-no');
    await expect.poll(async () => (await current(page)).revealing, { timeout: 5000 }).toBe(false);
  });
});

test.describe('全螢幕', () => {
  test('進入全螢幕後自動稱讚，不用再按鍵', async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', '只有 Chromium 能從測試裡切換視窗的全螢幕狀態');
    await open(page);
    const session = await page.context().newCDPSession(page);
    const { windowId } = (await session.send('Browser.getWindowForTarget')) as { windowId: number };
    await session.send('Browser.setWindowBounds', {
      bounds: { windowState: 'fullscreen' },
      windowId,
    });
    await expect.poll(async () => await currentId(page), { timeout: 5000 }).toBe('fullscreen-yes');
    await session.send('Browser.setWindowBounds', { bounds: { windowState: 'normal' }, windowId });
  });

  test('先說了「好吧」之後才進全螢幕，也會改口稱讚', async ({ browserName, page }) => {
    test.skip(browserName !== 'chromium', '只有 Chromium 能從測試裡切換視窗的全螢幕狀態');
    await open(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('fullscreen-no');
    const session = await page.context().newCDPSession(page);
    const { windowId } = (await session.send('Browser.getWindowForTarget')) as { windowId: number };
    await session.send('Browser.setWindowBounds', {
      bounds: { windowState: 'fullscreen' },
      windowId,
    });
    await expect.poll(async () => await currentId(page), { timeout: 5000 }).toBe('fullscreen-yes');
    await session.send('Browser.setWindowBounds', { bounds: { windowState: 'normal' }, windowId });
  });
});
