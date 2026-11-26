import { beatsOf } from '../src/units/index';
import { openAt } from './fuzz-support';
import { studentEditor } from './gate-view';
import { expect, test, type Page } from './test';

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

const motion = async (page: Page): Promise<Array<string>> =>
  ((await page.locator('html').getAttribute('data-motion')) ?? '').split(' ');

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
    await page.addInitScript(() => {
      const animated: Array<string> = [];
      Object.assign(globalThis, { animated });
      const original: unknown = Reflect.get(Element.prototype, 'animate');
      if (typeof original !== 'function') {
        throw new TypeError('Element has no animate');
      }
      Element.prototype.animate = function animate(
        this: Element,
        ...values: Parameters<Element['animate']>
      ): Animation {
        if (this instanceof HTMLElement) {
          animated.push(this.dataset.key ?? this.dataset.role ?? '');
        }
        const made: unknown = Reflect.apply(original, this, values);
        if (!(made instanceof Animation)) {
          throw new TypeError('animate did not return an animation');
        }
        return made;
      };
    });
    await openAt(page, gate, studentEditor);
    await page.keyboard.press('x');
    await expect(page.locator(`${runner} [data-role="hint"]`)).toContainText('G');
    await page.keyboard.press('G');
    await expect(page.locator(`${runner} [data-role="effect"]`)).not.toBeEmpty();
    const shown = await page.evaluate((selector) => {
      const animated: unknown = Reflect.get(globalThis, 'animated');
      const names = [...document.querySelectorAll(`${selector} *`)].flatMap((element) =>
        getComputedStyle(element).animationName.split(', '),
      );
      if (!Array.isArray(animated)) {
        return { animated: [], names };
      }
      return { animated: animated.map(String), names };
    }, runner);
    expect(shown.animated).not.toContain('G');
    expect(shown.names).not.toContain('key-waits');
    expect(shown.names.filter((name) => name.startsWith('cursor-lands-'))).toEqual([]);
  });
});
