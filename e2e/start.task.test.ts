import { say, ui } from '../src/lib/text/ui';
import { studentEditor } from './gate-view';
import { currentId } from './scene-view';
import {
  open,
  lessons,
  follow,
  status,
  output,
  wrap,
  writeProgram,
  editorText,
} from './start-support';
import { expect, test } from './test';

test.describe('起步單元：最後一題與執行', () => {
  test.use({ reducedMotion: 'reduce' });

  test('寫錯會顯示編譯沒有過，無窮迴圈會被停下來', async ({ page }) => {
    await open(page, 'task');
    await writeProgram(page, wrap('    cout << 11'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText(ui['run.compileError'], { timeout: 150_000 });
    await expect(output(page)).toContainText(say('explain.semicolon', { line: '7' }));
    expect(await currentId(page)).toBe('task');
    await writeProgram(page, wrap('    while (true) {\n    }'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText(ui['run.timeout'], { timeout: 60_000 });
    await writeProgram(page, wrap('    cout << 33;'));
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText(ui['run.finished'], { timeout: 60_000 });
    await expect(page.locator('[data-role="note"]')).not.toBeEmpty();
    expect(await currentId(page)).toBe('task');
  });

  test('輪到學生時，焦點不在編輯器按 Enter 也會執行', async ({ page }) => {
    await open(page, 'task');
    const button = page.locator('[data-code-runner] [data-role="run"]');
    await expect(button).toBeEnabled();
    await expect(page.locator(studentEditor)).toHaveAttribute('tabindex', '0');
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText(ui['run.finished'], { timeout: 150_000 });
    expect(await currentId(page)).toBe('task');
  });

  test('command keys that have not been taught do nothing at the free task', async ({ page }) => {
    const editor = page.locator(studentEditor);
    const hint = page.locator('[data-code-runner] [data-role="hint"]');
    await open(page, 'task');
    await expect(editor).toBeFocused();
    const before = await editorText(page);
    for (const key of ['u', 'D', 'a', 's', 'C', 'J']) {
      await page.keyboard.press(key);
    }
    expect(await editorText(page)).toBe(before);
    await expect(hint).toContainText(ui['run.notTaught']);
  });

  test('a learner who returns without a draft finds what the earlier gates left', async ({
    page,
  }) => {
    await open(page, 'each-line');
    await expect(page.locator(studentEditor)).toContainText(String.raw`cout << 22 << '\n';`);
    await open(page, 'saw-output');
    await expect(page.locator(studentEditor)).toContainText('cout << 11;');
    await expect(page.locator(studentEditor)).not.toContainText('cout << 22');
  });

  test('the free task shows what to print, says what is wrong, and compiles with the prepared header', async ({
    page,
  }) => {
    const header = page.waitForResponse((response) => response.url().endsWith('/compiler/std.pch'));
    const note = page.locator('[data-role="note"]');
    await open(page, 'task');
    await expect(page.locator('[data-code-runner] [data-role="expect"]')).toHaveText('5 3');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText(ui['run.finished'], { timeout: 150_000 });
    expect((await header).status()).toBe(200);
    await expect(note).toHaveText(say('wrong.fewer', { got: '1', want: '2' }));
    await page.keyboard.press('o');
    await page.keyboard.type('cout << b;');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    await expect(status(page)).toHaveText(ui['run.compileError'], { timeout: 150_000 });
    await expect(note).toBeEmpty();
    await open(page, 'run-cin');
    await expect(page.locator('[data-code-runner] [data-role="expect-field"]')).toBeHidden();
  });

  test('the free task says why a key does nothing', async ({ page }) => {
    const hint = page.locator('[data-code-runner] [data-role="hint"]');
    await open(page, 'task');
    await page.keyboard.press('ArrowUp');
    await expect(hint).toHaveText(ui['run.noArrows']);
    expect(await currentId(page)).toBe('task');
    await page.keyboard.press('w');
    await expect(hint).toHaveText(ui['run.notTaught']);
    await page.keyboard.press('PageUp');
    expect(await currentId(page)).toBe('two-vars');
  });

  test('the given input is shown, cannot be changed, and takes no keys', async ({ page }) => {
    await open(page, 'run-cin');
    const given = page.locator('[data-code-runner] [data-role="stdin"]');
    await expect(given).toHaveText('42');
    await given.click();
    await page.keyboard.type('9');
    await expect(given).toHaveText('42');
    await expect(
      page.locator('textarea, input, select, [contenteditable]:not([contenteditable="false"])'),
    ).toHaveCount(0);
    await follow(page, lessons['run-cin'] ?? []);
    await expect.poll(async () => await currentId(page), { timeout: 150_000 }).not.toBe('run-cin');
  });
});
