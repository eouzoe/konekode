import { say, ui } from '../src/lib/text/ui';
import { describeCommand, describeNext } from '../src/lib/typing/hint';
import { studentEditor } from './gate-view';
import { current, currentId } from './scene-view';
import {
  open,
  lessons,
  solve,
  follow,
  status,
  output,
  programs,
  template,
  wrap,
  editorText,
  spriteEditor,
} from './start-support';
import { recordedAs } from './stored';
import { expect, test, type Page } from './test';

test.describe('起步單元：編輯器關卡', () => {
  test.use({ reducedMotion: 'reduce' });

  test('a guided gate accepts only the next key and says which one', async ({ page }) => {
    const editor = page.locator(studentEditor);
    const hint = page.locator('[data-code-runner] [data-role="hint"]');
    await open(page, 'run-cout');
    await expect(editor).toBeFocused();
    await expect(hint).toHaveText(describeCommand('G'));
    const before = await editorText(page);
    for (const key of ['d', 'd', 'x', 'D', 'u', 'o', 'a', 'i', 'c', 'Delete', 'Backspace', 'Tab']) {
      await page.keyboard.press(key);
    }
    await page.keyboard.insertText('cout << 11;');
    await page.keyboard.insertText('ｃ');
    expect(await editorText(page)).toBe(before);
    const answers: readonly (readonly [key: string, lead: string])[] = [
      ['x', ui['typing.wrong']],
      ['g', ui['guide.case']],
      ['Backspace', ui['typing.noDelete']],
      ['Enter', ui['guide.earlyRun']],
      ['c', ui['guide.needInsert']],
      ['ArrowDown', ui['guide.arrow']],
    ];
    for (const [key, lead] of answers) {
      await page.keyboard.press(key);
      await expect(hint).toHaveText(`${lead}${describeCommand('G')}`);
    }
    expect(await editorText(page)).toBe(before);
    await page.keyboard.press('G');
    await expect(hint).toHaveText(describeCommand('O'));
    await page.keyboard.press('O');
    await expect(hint).toBeEmpty();
    await page.keyboard.press('ArrowLeft');
    await expect(hint).toHaveText(`${ui['guide.arrow']}${describeNext('c')}`);
    await page.keyboard.press('Escape');
    await expect(hint).toHaveText(`${ui['guide.earlyLeave']}${describeNext('c')}`);
    expect(await currentId(page)).toBe('run-cout');
    await expect(hint).toBeEmpty({ timeout: 5000 });
    await page.keyboard.type('cout <');
    await expect(hint).toHaveText(describeNext('<'));
    await page.keyboard.press('x');
    await expect(hint).toHaveText(`${ui['typing.wrong']}${describeNext('<')}`);
    await page.keyboard.type('< 11;');
    await expect(hint).toHaveText(ui['typing.pressEsc']);
    await page.keyboard.press('Escape');
    await expect(hint).toHaveText(ui['typing.runNow']);
    await page.keyboard.press('x');
    await expect(hint).toHaveText(`${ui['typing.wrong']}${ui['typing.pressEnter']}`);
    expect(await editorText(page)).toBe(programs['run-cout'] ?? '');
    await page.keyboard.press('Enter');
    await expect.poll(async () => await currentId(page), { timeout: 150_000 }).toBe('saw-output');
  });

  for (const gate of ['run-cout', 'run-two', 'run-newline', 'run-int', 'run-cin']) {
    test(`${gate} shows the verified result at once, without the compiler`, async ({ page }) => {
      await open(page, gate);
      await solve(page, gate);
      await expect(status(page)).toHaveText(ui['run.finished'], { timeout: 1000 });
      await expect.poll(async () => (await current(page)).waiting, { timeout: 3000 }).toBe(false);
      expect(await currentId(page)).not.toBe(gate);
    });
  }

  test('a guided gate records the entry and every press with its unit', async ({ page }) => {
    const hint = page.locator('[data-code-runner] [data-role="hint"]');
    await open(page, 'run-cout');
    await expect(hint).toHaveText(describeCommand('G'));
    await page.keyboard.press('g');
    await page.keyboard.press('G');
    await expect(hint).toHaveText(describeCommand('O'));
    await expect.poll(async () => await recordedAs(page, 'step.tried start run-cout')).toBe(2);
    await expect.poll(async () => await recordedAs(page, 'task.entered start run-cout')).toBe(1);
  });

  test('a gate starts from its own declared text, not from a stray draft', async ({ page }) => {
    await open(page, 'run-two', { draft: { cursor: 0, text: wrap('    something else;') } });
    await expect(page.locator(studentEditor)).toBeFocused();
    expect(await editorText(page)).toBe(programs['run-cout'] ?? '');
    await follow(page, lessons['run-two'] ?? []);
    await expect
      .poll(async () => await currentId(page), { timeout: 150_000 })
      .toBe('stuck-together');
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

  const free = Object.keys(programs).filter((gate) => !(gate in lessons));

  const cannotPass = async (page: Page, gate: string): Promise<void> => {
    await open(page, gate);
    for (const key of ['Space', 'ArrowRight', 'ArrowDown', 'Enter', 'Space']) {
      await page.keyboard.press(key);
    }
    if (free.includes(gate)) {
      await expect(status(page)).toHaveText(ui['run.finished'], { timeout: 150_000 });
      await expect(output(page)).not.toBeEmpty();
    }
    if (gate in lessons) {
      await expect(status(page)).toBeEmpty();
    }
    expect(await currentId(page)).toBe(gate);
  };

  for (const gate of ['type-template', ...Object.keys(lessons)]) {
    test(`${gate} cannot be passed without finishing it`, async ({ page }) => {
      await cannotPass(page, gate);
    });
  }

  test.describe('with the compiler', () => {
    test.use({ compiler: true });

    for (const gate of free) {
      test(`${gate} cannot be passed without finishing it`, async ({ page }) => {
        await cannotPass(page, gate);
      });
    }
  });

  const distractions: Record<string, (page: Page) => Promise<void>> = {
    'clicking the dialogue': async (page) => {
      await page.locator('[data-role="dialogue"]').click();
    },
    'clicking the learned keys': async (page) => {
      await page.locator('[data-code-runner] [data-role="keys"]').click();
    },
    'clicking the page': async (page) => {
      await page.mouse.click(4, 4);
    },
    'losing focus': async (page) => {
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      });
    },
  };

  for (const gate of Object.keys(lessons)) {
    for (const [name, distract] of Object.entries(distractions)) {
      test(`${gate} still takes every key after ${name}`, async ({ page }) => {
        await open(page, gate);
        await expect(page.locator(studentEditor)).toBeVisible();
        await distract(page);
        await follow(page, lessons[gate] ?? []);
        await expect.poll(async () => await currentId(page), { timeout: 150_000 }).not.toBe(gate);
      });
    }
  }

  for (const [name, distract] of Object.entries(distractions)) {
    test(`the typing drill still takes every key after ${name}`, async ({ page }) => {
      await open(page, 'type-template');
      await expect(page.locator('[data-typing-drill]')).toBeVisible();
      if (name !== 'clicking the learned keys') {
        await distract(page);
      }
      await page.keyboard.type(`i${template}`);
      await page.keyboard.press('Escape');
      await expect.poll(async () => (await current(page)).waiting).toBe(false);
      await page.keyboard.press('Space');
      expect(await currentId(page)).not.toBe('type-template');
    });
  }

  test('a guided gate draws what is still to do in place, and nothing is left when it is done', async ({
    page,
  }) => {
    const ghosts = page.locator(`${studentEditor} .cm-ghost`);
    await open(page, 'run-cout');
    await expect(ghosts).toHaveText(['    cout << 11;']);
    for (const key of ['G', 'O']) {
      await page.keyboard.press(key);
    }
    await page.keyboard.type('cout <');
    await expect(ghosts).toHaveText(['< 11;']);
    expect(await editorText(page)).toContain('    cout <\n');
    await page.keyboard.type('< 11;');
    await expect(ghosts).toHaveCount(0);
    await open(page, 'run-cin');
    await expect(page.locator(`${studentEditor} .cm-ghost-remove`)).toHaveText('11');
    await expect(ghosts).toHaveText(['    cin >> a;']);
    await open(page, 'where-it-goes');
    await expect(page.locator(`${spriteEditor} .cm-ghost`)).toHaveText(['    cout << 11;']);
    expect(await editorText(page, spriteEditor)).not.toContain('cout << 11;');
  });

  test('the keys learned so far are shown in the order taught, and the next one is marked', async ({
    page,
  }) => {
    const row = page.locator('[data-code-runner] [data-role="keys"]');
    await open(page, 'run-cout');
    await expect(row.locator('kbd')).toHaveText(['i', 'G', 'O']);
    await expect(row.locator('kbd[data-next="true"]')).toHaveText('G');
    await page.keyboard.press('G');
    await expect(row.locator('kbd[data-next="true"]')).toHaveText('O');
    await page.keyboard.press('O');
    await expect(row).toHaveAttribute('data-mode', 'insert');
    await expect(row.locator('kbd[data-next="true"]')).toHaveCount(0);
    await open(page, 'run-cin');
    await expect(row.locator('kbd')).toHaveText('iGOo$k.dj0fx'.split(''));
  });

  test('a command that saves work says what it did', async ({ page }) => {
    const effect = page.locator('[data-code-runner] [data-role="effect"]');
    await open(page, 'run-cout');
    await expect(effect).toBeEmpty();
    await page.keyboard.press('G');
    await expect(effect).toHaveText(say('effect.lines', { count: '6', keys: '1' }));
    await open(page, 'run-newline');
    const keys = lessons['run-newline'] ?? [];
    await follow(page, keys.slice(0, keys.indexOf('.') + 1));
    await expect(effect).toHaveText(say('effect.repeat', { count: '10', keys: '1' }));
    await expect
      .poll(async () => await editorText(page))
      .toContain(String.raw`    cout << 11 << '\n';`);
    await open(page, 'run-int');
    await follow(page, ['d', 'j']);
    await expect(effect).toHaveText(say('effect.dropped', { count: '2', keys: '2' }));
  });
});

test.describe('有動態效果時的關卡', () => {
  for (const gate of Object.keys(lessons)) {
    test(`${gate} takes the keys as soon as its sentence is shown`, async ({ page }) => {
      await open(page, gate);
      expect((await current(page)).revealing).toBe(true);
      await page.keyboard.press('Space');
      expect((await current(page)).revealing).toBe(false);
      await follow(page, lessons[gate] ?? []);
      await expect.poll(async () => await currentId(page), { timeout: 150_000 }).not.toBe(gate);
    });
  }
});
