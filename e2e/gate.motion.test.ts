import { expect, test, type Page } from '@playwright/test';

import { beatsOf } from '../src/units/index';
import { openAt } from './fuzz-support';
import { studentEditor } from './gate-view';

const gate = 'run-cout';
const teaches = 'open-below';
const runner = '[data-code-runner]';

const watchMotion = async (page: Page): Promise<void> => {
  await page.evaluate(() => {
    const seen = new Set<string>();
    const look = (): void => {
      const running = document.getAnimations().filter((one) => one.playState === 'running');
      for (const animation of running) {
        const { effect } = animation;
        if (animation instanceof CSSAnimation) {
          seen.add(`css:${animation.animationName}`);
        } else if (effect instanceof KeyframeEffect && effect.target instanceof HTMLElement) {
          const { key, role } = effect.target.dataset;
          seen.add(`script:${key ?? role ?? ''}`);
        }
      }
      document.documentElement.dataset.motion = [...seen].join(' ');
      requestAnimationFrame(look);
    };
    look();
  });
};

const motion = async (page: Page): Promise<string[]> =>
  ((await page.locator('html').getAttribute('data-motion')) ?? '').split(' ');

const frames = async (page: Page, count: number): Promise<void> => {
  for (let at = 0; at < count; at += 1) {
    await page.evaluate(
      async () =>
        await new Promise<number>((resolve) => {
          requestAnimationFrame(resolve);
        }),
    );
  }
};

test('with motion allowed, a wrong key, a saving command and the waiting key really move', async ({
  page,
}) => {
  await openAt(page, gate, studentEditor);
  await watchMotion(page);
  await expect.poll(async () => await motion(page)).toContain('css:key-waits');
  await page.keyboard.press('x');
  await expect.poll(async () => await motion(page)).toContain('script:G');
  await page.keyboard.press('G');
  await expect.poll(async () => await motion(page)).toContain('script:effect');
  const seen = await motion(page);
  expect(seen.some((name) => name.startsWith('css:cursor-lands-'))).toBe(true);
});

test('with motion allowed, a key that has just been taught arrives with a movement', async ({
  page,
}) => {
  const beats = beatsOf('start');
  const before = beats[beats.findIndex((beat) => beat.id === teaches) - 1]?.id ?? '';
  await openAt(page, before, 'body');
  await expect(page.locator('[data-scene]')).not.toHaveAttribute('data-revealing', 'true');
  await expect(page.locator(`${runner} kbd[data-key="o"]`)).toHaveCount(0);
  await watchMotion(page);
  await page.keyboard.press('Space');
  await expect(page.locator(`${runner} kbd[data-key="o"]`)).toHaveAttribute('data-fresh', 'true');
  await expect.poll(async () => await motion(page)).toContain('css:key-arrives');
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('nothing shakes, pulses or flashes, and the words are still there', async ({ page }) => {
    await openAt(page, gate, studentEditor);
    await watchMotion(page);
    await page.keyboard.press('x');
    await expect(page.locator(`${runner} [data-role="hint"]`)).toContainText('G');
    await page.keyboard.press('G');
    await expect(page.locator(`${runner} [data-role="effect"]`)).not.toBeEmpty();
    await frames(page, 6);
    const seen = await motion(page);
    expect(seen).not.toContain('script:G');
    expect(seen).not.toContain('css:key-waits');
    expect(seen.filter((name) => name.startsWith('css:cursor-lands-'))).toEqual([]);
  });
});
