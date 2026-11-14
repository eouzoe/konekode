import { expect, test, type Page } from '@playwright/test';
import { array, object, parse, string } from 'valibot';
import { createActor } from 'xstate';

import { beatSchema, sceneMachine, type BeatMeta } from '../src/lib/scene/machine';

interface Current {
  readonly id: string;
  readonly revealing: boolean;
  readonly wait: string;
  readonly waiting: boolean;
}

const path = '/learn/start/';
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
  'run-78': wrap('    cout << 7;\n    cout << 8;'),
  'run-cin': wrap("    int a{};\n    cin >> a;\n    cout << a << '\\n';"),
  'run-cout': wrap('    cout << 7;'),
  'run-int': wrap("    int a{7};\n    cout << a << '\\n';"),
  'run-newline': wrap("    cout << 7 << '\\n';\n    cout << 8 << '\\n';"),
  task: wrap(
    "    int a{};\n    int b{};\n    cin >> a >> b;\n    cout << b << '\\n';\n    cout << a << '\\n';",
  ),
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

const open = async (
  page: Page,
  position: string | null = null,
  unlocked: readonly string[] = [],
): Promise<void> => {
  await page.goto(path);
  await page.evaluate(
    ({ ids, ref }) => {
      localStorage.clear();
      const unit = document.querySelector<HTMLElement>('[data-scene]')?.dataset.unit ?? '';
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
    { ids: [...unlocked], ref: position },
  );
  await page.reload();
  await page.locator('[data-scene][data-ready="true"]').waitFor();
};

const writeProgram = async (page: Page, source: string): Promise<void> => {
  await page.locator('.cm-content').click();
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

const advance = async (page: Page, state: Current): Promise<void> => {
  if (state.waiting && state.wait === 'drill') {
    await typeTemplate(page);
    return;
  }
  if (state.waiting && state.wait === 'run') {
    await writeProgram(page, programs[state.id] ?? '');
    await page.keyboard.press('Enter');
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
  return parse(array(beatSchema), raw);
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
    await writeProgram(page, wrap('    cout << 7'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('編譯沒有過', { timeout: 150_000 });
    await expect(output(page)).toContainText('行的最後面少了分號');
    expect(await currentId(page)).toBe('run-cout');
    await writeProgram(page, wrap('    while (true) {\n    }'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('跑太久，已經停下來', { timeout: 60_000 });
    await writeProgram(page, wrap('    cout << 8;'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText('執行完成', { timeout: 60_000 });
    await expect(page.locator('[data-role="note"]')).not.toBeEmpty();
    expect(await currentId(page)).toBe('run-cout');
  });

  test('不是輪到學生時不能執行也不能改，Enter 就是下一句', async ({ page }) => {
    await open(page, 'do-things');
    const button = page.locator('[data-code-runner] [data-role="run"]');
    const editor = page.locator('.cm-content');
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
    await expect(page.locator('.cm-content')).toHaveAttribute('contenteditable', 'true');
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
    const editor = page.locator('.cm-content');
    await open(page, 'type-template');
    await expect(typing).toBeFocused();
    await page.keyboard.type('i#include <');
    await expect(auto).toHaveCount(0);
    await open(page, 'type-template', ['pair.include-angle', 'pair.paren', 'pair.brace']);
    await expect(typing).toBeFocused();
    await page.keyboard.type('i#include <');
    await expect(auto).toHaveText(['>']);
    await open(page, 'run-cout');
    await expect(editor).toBeFocused();
    await page.keyboard.press('o');
    await page.keyboard.type('int a{');
    await expect(editor).toContainText('int a{');
    await expect(editor).not.toContainText('int a{}');
    await open(page, 'run-cout', ['pair.brace']);
    await expect(editor).toBeFocused();
    await page.keyboard.press('o');
    await page.keyboard.type('int a{');
    await expect(editor).toContainText('int a{}');
  });

  test('走到示範開頭的那一句，成對符號的解鎖會寫進紀錄', async ({ page }) => {
    await open(page, 'lets-type');
    const unlockedNow = async (): Promise<Set<string>> => {
      const raw = await page.evaluate(() => localStorage.getItem('cp:events:v1') ?? '[]');
      const value: unknown = JSON.parse(raw);
      const events = parse(storedEvents, value).filter((event) => event.kind === 'item.unlocked');
      return new Set(events.map((event) => event.ref));
    };
    const wanted = new Set(['pair.brace', 'pair.include-angle', 'pair.paren']);
    expect(await unlockedNow()).toEqual(new Set());
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('demo-intro');
    expect(await unlockedNow()).toEqual(wanted);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    expect(await unlockedNow()).toEqual(wanted);
  });

  test('輪到學生時焦點自動進編輯器，只用鍵盤就能過第一關', async ({ page }) => {
    await open(page, 'run-cout');
    await expect(page.locator('.cm-content')).toBeFocused();
    for (const key of ['j', 'j', 'j', 'j', 'j', 'o']) {
      await page.keyboard.press(key);
    }
    await page.keyboard.type('cout << 7;');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect.poll(async () => await currentId(page), { timeout: 150_000 }).toBe('saw-7');
    await expect(page.locator('.cm-content')).not.toBeFocused();
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('arrows-out');
  });

  test('小精靈的示範會操作編輯器，輪到學生時還原', async ({ page }) => {
    await open(page, 'semicolon');
    const editor = page.locator('.cm-content');
    await expect(editor).toContainText('cout << 7;', { timeout: 15_000 });
    await expect(editor).not.toBeFocused();
    const indented = await page.evaluate(() =>
      [...document.querySelectorAll('.cm-line')].some((line) =>
        (line.textContent ?? '').startsWith('    cout << 7;'),
      ),
    );
    expect(indented).toBe(true);
    await page.keyboard.press('ArrowLeft');
    expect(await currentId(page)).toBe('indent');
    await expect(editor).not.toContainText('cout << 7;');
    for (let step = 0; step < 6 && (await currentId(page)) !== 'run-cout'; step += 1) {
      await page.keyboard.press('Space');
    }
    expect(await currentId(page)).toBe('run-cout');
    await expect(editor).not.toContainText('cout << 7;');
    await expect(editor).toBeFocused();
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
    await open(page, 'move-jk');
    const read = async (): Promise<string> =>
      await page.evaluate(() => {
        const keys: unknown = Reflect.get(globalThis, 'shownKeys');
        if (!Array.isArray(keys)) {
          return '';
        }
        return keys.join('');
      });
    await expect.poll(read, { timeout: 15_000 }).toBe('jjjkjjj');
    await expect(page.locator('[data-code-runner] [data-role="keycap"]')).toBeEmpty();
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
