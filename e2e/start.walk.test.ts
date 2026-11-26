import { beats } from '../src/units/start';
import { current, currentId } from './scene-view';
import { open, programs, advance } from './start-support';
import { storedPosition, storedSummary } from './stored';
import { expect, test } from './test';

const compilerScript = /\/compiler\.worker[^/]*\.js(?:\?|$)/u;
const warmAt = beats[beats.findIndex((beat) => beat.free === true) - 1]?.id ?? '';

test.describe('起步單元：從頭到尾', () => {
  test.use({ reducedMotion: 'reduce' });

  test('從第一句走到最後一句，每個關卡都能過', async ({ page }) => {
    expect(warmAt).not.toBe('');
    const started: Array<string> = [];
    page.on('request', (request) => {
      if (compilerScript.test(request.url())) {
        started.push(request.url());
      }
    });
    await open(page);
    const seen: Array<string> = [];
    let warming = false;
    for (let step = 0; step < 300; step += 1) {
      const state = await current(page);
      if (seen.at(-1) !== state.id) {
        seen.push(state.id);
      }
      warming ||= state.id === warmAt;
      if (state.id === 'done') {
        break;
      }
      if (!warming) {
        expect(started, `the compiler started at ${state.id}`).toEqual([]);
      }
      await advance(page, state);
    }
    expect(seen.at(-1)).toBe('done');
    expect(seen).toContain(warmAt);
    await expect.poll(() => started.length).toBeGreaterThan(0);
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
