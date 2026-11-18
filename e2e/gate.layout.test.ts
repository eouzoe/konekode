import { checksOf } from '../src/units/index';
import { openAt } from './fuzz-support';
import { arrive, tap } from './gate-support';
import { studentEditor } from './gate-view';
import { frames } from './scene-view';
import { expect, test, type Page } from './test';

interface Box {
  readonly bottom: number;
  readonly left: number;
  readonly name: string;
  readonly right: number;
  readonly top: number;
}

interface Layout {
  readonly ceiling: number;
  readonly cursor: Box | null;
  readonly parts: readonly Box[];
  readonly width: number;
}

const sizes = [
  { height: 720, width: 1280 },
  { height: 768, width: 1366 },
  { height: 864, width: 1536 },
  { height: 1080, width: 1920 },
];
const slack = 1;
const settledStates = /^(?:ok|error)$/u;

const cursorClass = 'cm-own-line';
const settling = 2;

const measure = async (page: Page): Promise<Layout> => {
  await frames(page, settling);
  const found = await page.evaluate((lineClass) => {
    const runner = document.querySelector('[data-code-runner]');
    const dialogue = document.querySelector('[data-role="dialogue"]');
    const shown = [
      ...(runner?.children ?? []),
      ...(runner?.querySelectorAll(`.${lineClass}`) ?? []),
    ];
    const boxes = shown.map((element) => {
      const { bottom, left, right, top } = element.getBoundingClientRect();
      return { bottom, left, name: element.className, right, top };
    });
    return {
      boxes: boxes.filter((box) => box.bottom > box.top),
      ceiling: dialogue?.getBoundingClientRect().top ?? 0,
      width: innerWidth,
    };
  }, cursorClass);
  return {
    ceiling: found.ceiling,
    cursor: found.boxes.find((box) => box.name.includes(cursorClass)) ?? null,
    parts: found.boxes.filter((box) => !box.name.includes(cursorClass)),
    width: found.width,
  };
};

const expectInside = (layout: Layout, label: string): void => {
  const names = layout.parts.map((part) => part.name);
  expect(names, label).toContain('editor');
  expect(names, label).toContain('bar');
  for (const part of layout.parts) {
    const where = `${label}: ${part.name}`;
    expect(part.top, where).toBeGreaterThanOrEqual(-slack);
    expect(part.left, where).toBeGreaterThanOrEqual(-slack);
    expect(part.right, where).toBeLessThanOrEqual(layout.width + slack);
    expect(part.bottom, where).toBeLessThanOrEqual(layout.ceiling + slack);
  }
  const editor = layout.parts.find((part) => part.name === 'editor');
  expect(layout.cursor?.top ?? -1, `${label}: cursor`).toBeGreaterThanOrEqual(
    (editor?.top ?? 0) - slack,
  );
  expect(layout.cursor?.bottom ?? Infinity, `${label}: cursor`).toBeLessThanOrEqual(
    (editor?.bottom ?? 0) + slack,
  );
};

const finish = async (page: Page, gate: string): Promise<void> => {
  const walk = arrive(page, gate);
  for (const expected of walk.session.path) {
    if (expected.kind !== 'run') {
      await tap(walk, expected.key);
    }
  }
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-code-runner]')).toHaveAttribute('data-state', settledStates, {
    timeout: 150_000,
  });
};

for (const size of sizes) {
  const name = `${String(size.width)}×${String(size.height)}`;
  test(`${name}: nothing at a gate is covered or cut off, before or after running`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    for (const gate of checksOf('start')) {
      await openAt(page, gate.id, studentEditor);
      expectInside(await measure(page), `${name}, ${gate.id}, on arrival`);
      await finish(page, gate.id);
      expectInside(await measure(page), `${name}, ${gate.id}, after running`);
    }
  });
}
