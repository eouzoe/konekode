import { createActor } from 'xstate';

import { sceneMachine } from '../src/lib/scene/machine';
import { current, currentId } from './scene-view';
import { open, readMetas } from './start-support';
import { expect, test, type Page } from './test';
import { passUntil } from './time';

const noteNextKey = async (page: Page, name: string): Promise<void> => {
  await page.evaluate((as) => {
    globalThis.addEventListener(
      'keydown',
      (event) => {
        document.documentElement.dataset[as] = String(event.defaultPrevented);
      },
      { once: true },
    );
  }, name);
};

test.describe('起步單元：對話', () => {
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

  test('Backspace outside a gate is kept from the browser and does not turn the sentence', async ({
    page,
  }) => {
    await open(page);
    await noteNextKey(page, 'unfocused');
    await page.keyboard.press('Backspace');
    await expect(page.locator('html')).toHaveAttribute('data-unfocused', 'true');
    await page.locator('[data-role="back"]').focus();
    await noteNextKey(page, 'button');
    await page.keyboard.press('Backspace');
    await expect(page.locator('html')).toHaveAttribute('data-button', 'true');
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
});

test.describe('有動態效果時', () => {
  test.use({ heldTime: true });

  test('文字逐字出現，按一下先顯示完整句，再按才換句', async ({ page }) => {
    await open(page);
    expect((await current(page)).revealing).toBe(true);
    await page.keyboard.press('Space');
    const shown = await current(page);
    expect(shown.id).toBe('fullscreen-ask');
    expect(shown.revealing).toBe(false);
    await page.keyboard.press('Space');
    expect(await currentId(page)).toBe('fullscreen-no');
    expect((await current(page)).revealing).toBe(true);
    await passUntil(page, async () => !(await current(page)).revealing, { label: 'the sentence' });
    expect(await currentId(page)).toBe('fullscreen-no');
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
