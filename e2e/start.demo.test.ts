import { ui } from '@konekode/course/ui';

import { studentEditor } from './gate-view';
import { currentId } from './scene-view';
import { open, status, output, programs, draftAt, editorText, spriteEditor } from './start-support';
import { expect, test, type Page } from './test';
import { pass, passUntil } from './time';

const quiet = 3000;

const spriteShows = async (page: Page, wanted: string, label: string): Promise<void> => {
  await passUntil(page, async () => (await editorText(page, spriteEditor)) === wanted, { label });
};

test.describe('起步單元：小精靈的示範', () => {
  test.use({ heldTime: true, reducedMotion: 'reduce' });

  test('不是輪到學生時不能執行也不能改，Enter 就是下一句', async ({ page }) => {
    await open(page, 'do-things');
    const button = page.locator('[data-code-runner] [data-role="run"]');
    const editor = page.locator(studentEditor);
    await expect(button).toBeDisabled();
    await expect(editor).not.toHaveAttribute('tabindex');
    await page.keyboard.press('Enter');
    expect(await currentId(page)).toBe('editor');
    await expect(status(page)).toBeEmpty();
  });

  test('小精靈在自己的編輯器裡示範，學生的編輯器沒有被動過', async ({ page }) => {
    await open(page, 'semicolon');
    const sprite = page.locator(spriteEditor);
    const student = page.locator(studentEditor);
    await expect(sprite).toBeVisible();
    await expect(student).toBeHidden();
    await passUntil(
      page,
      async () => (await editorText(page, spriteEditor)).split('\n').includes('    cout << 11;'),
      { label: 'the demonstration' },
    );
    expect(await editorText(page)).not.toContain('cout << 11;');
    await page.keyboard.press('ArrowLeft');
    expect(await currentId(page)).toBe('indent');
    expect(await editorText(page, spriteEditor)).not.toContain('cout << 11;');
    for (let step = 0; step < 6 && (await currentId(page)) !== 'run-cout'; step += 1) {
      await page.keyboard.press('Space');
    }
    expect(await currentId(page)).toBe('run-cout');
    await expect(student).toBeVisible();
    await expect(sprite).toBeHidden();
    await expect(student).toBeFocused();
    expect(await editorText(page)).not.toContain('cout << 11;');
  });

  test('示範時會依序顯示小精靈按的每一個鍵', async ({ page }) => {
    await page.addInitScript(() => {
      const shown: Array<string> = [];
      Object.assign(globalThis, { shownKeys: shown });
      document.addEventListener('DOMContentLoaded', () => {
        const keycap = document.querySelector('[data-code-runner] [data-role="keycap"]');
        if (keycap === null) {
          return;
        }
        const note = (): void => {
          const text = keycap.textContent;
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
    const keycap = page.locator('[data-code-runner] [data-role="keycap"]');
    await passUntil(page, async () => (await read()) !== '', { label: 'the first key' });
    await passUntil(page, async () => (await keycap.textContent()) === '', {
      label: 'the end of the demonstration',
    });
    expect(await read()).toBe('G');
  });

  test('小精靈示範的執行結果不會被算成學生過關', async ({ page }) => {
    await open(page, 'what-run');
    await passUntil(page, async () => (await status(page).textContent()) !== '', {
      label: 'the demonstrated run',
    });
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('run-cout');
    await expect(page.locator(studentEditor)).toBeFocused();
    expect(await editorText(page)).not.toContain('cout << 11;');
    await expect(status(page)).toBeEmpty();
    await expect(output(page)).toBeEmpty();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-code-runner] [data-role="hint"]')).toContainText(
      ui['guide.earlyRun'],
    );
    await expect(status(page)).toBeEmpty();
    expect(await currentId(page)).toBe('run-cout');
  });

  test('小精靈的示範打完時，不會出現稱讚學生的話', async ({ page }) => {
    const hint = page.locator('[data-typing-drill] [data-role="hint"]');
    await open(page, 'type-template');
    await expect(page.locator('[data-typing-drill] [data-role="input"]')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    expect(await currentId(page)).toBe('press-esc');
    const mode = page.locator('[data-typing-drill] [data-role="mode"]');
    await passUntil(page, async () => (await mode.textContent()) === '-- NORMAL --', {
      label: 'the demonstration',
    });
    await pass(page, quiet);
    await expect(hint).toBeEmpty();
    await page.keyboard.press('ArrowRight');
    expect(await currentId(page)).toBe('type-template');
    await expect(hint).toHaveText(ui['typing.begin']);
  });

  test('小精靈每一段示範做出來的程式，和要學生做的一模一樣', async ({ page }) => {
    const first = programs['run-cout'] ?? '';
    const second = programs['run-two'] ?? '';
    const third = programs['run-newline'] ?? '';
    const fourth = programs['run-int'] ?? '';
    const cases: ReadonlyArray<
      [beat: string, draft: { cursor: number; text: string }, wanted: string]
    > = [
      ['type-second', draftAt(first, 'cout << 11;'), second],
      ['repeat', draftAt(second, 'cout << 22;'), third],
      ['next-line', draftAt(third, 'cout << 11'), fourth],
      ['add-cin', draftAt(fourth, 'cout << a'), programs['run-cin'] ?? ''],
    ];
    for (const [beat, draft, wanted] of cases) {
      await open(page, beat, { draft, unlocked: ['pair.paren', 'pair.brace'] });
      await spriteShows(page, wanted, beat);
    }
  });

  test('a demonstration starts from the unit text, whatever the learner has', async ({ page }) => {
    const mine = programs['run-two'] ?? '';
    await open(page, 'semicolon', { draft: draftAt(mine, 'cout << 22;') });
    await spriteShows(page, programs['run-cout'] ?? '', 'the first demonstration');
    await page.reload();
    await page.locator('[data-scene][data-ready="true"]').waitFor();
    await spriteShows(page, programs['run-cout'] ?? '', 'the demonstration after a reload');
  });
});
