import { current, currentId } from './scene-view';
import { open, programs, advance } from './start-support';
import { storedPosition, storedSummary } from './stored';
import { expect, test } from './test';

test.describe('起步單元：從頭到尾', () => {
  test.use({ reducedMotion: 'reduce' });

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
    try {
      await expect.poll(async () => await storedPosition(page)).toBe('done');
    } catch (error) {
      throw new Error(`${String(error)}\n${await storedSummary(page)}`, { cause: error });
    }
    await page.reload();
    await page.locator('[data-scene][data-ready="true"]').waitFor();
    expect(await currentId(page)).toBe('done');
  });
});
