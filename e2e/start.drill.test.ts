import { ui } from '@konekode/course/ui';

import { studentEditor } from './gate-view';
import { currentId } from './scene-view';
import { open, template } from './start-support';
import { recordedAs, storedEvents } from './stored';
import { expect, test } from './test';

test.describe('起步單元：打字練習', () => {
  test.use({ reducedMotion: 'reduce' });

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

  test('示範的提示與按鍵高亮，只在講到的那一句出現', async ({ page }) => {
    const hint = page.locator('[data-typing-drill] [data-role="hint"]');
    const lit = page.locator('[data-typing-drill] .key[data-next="true"]');
    const mode = page.locator('[data-typing-drill] [data-role="mode"]');
    await open(page, 'normal-readonly');
    await expect(hint).toBeEmpty();
    await expect(lit).toHaveCount(0);
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('press-i');
    await expect(hint).toHaveText(ui['typing.begin']);
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

  test('the drill marks a closer as completed only for unlocked pairs; the editor closes them', async ({
    page,
  }) => {
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
    await open(page, 'task');
    await expect(editor).toBeFocused();
    await page.keyboard.press('O');
    await page.keyboard.type('int a{');
    await expect(editor).toContainText('int a{}');
  });

  test('the typing drill records its entry and every judged press', async ({ page }) => {
    await open(page, 'type-template');
    await expect(page.locator('[data-typing-drill] [data-role="input"]')).toBeFocused();
    await page.keyboard.press('x');
    await page.keyboard.press('i');
    await page.keyboard.press('#');
    await expect.poll(async () => await recordedAs(page, 'step.tried start type-template')).toBe(3);
    await expect
      .poll(async () => await recordedAs(page, 'task.entered start type-template'))
      .toBe(1);
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
      const events = storedEvents
        .parse(value)
        .filter((event) => event.kind === 'item.unlocked' && event.ref.startsWith('pair.'));
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

  test('clicking the drill during a demonstration does not trap the keyboard', async ({ page }) => {
    const input = page.locator('[data-typing-drill] [data-role="input"]');
    await open(page, 'press-i');
    await expect(input).not.toHaveAttribute('tabindex');
    await page.locator('[data-typing-drill]').click();
    await expect(input).not.toBeFocused();
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('insert-is');
    await open(page, 'type-template');
    await expect(input).toHaveAttribute('tabindex', '0');
    await expect(input).toBeFocused();
  });
});
