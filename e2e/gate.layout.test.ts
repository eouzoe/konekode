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

type Frame = Readonly<Record<string, number>>;

interface Layout {
  readonly ceiling: number;
  readonly cursor: Box | null;
  readonly frame: Frame;
  readonly parts: readonly Box[];
  readonly scaled: readonly string[];
  readonly width: number;
}

const sizes = [
  { height: 650, width: 900 },
  { height: 620, width: 1100 },
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
    const editor = runner?.querySelector('[data-role="editor"]')?.getBoundingClientRect();
    const bar = runner?.querySelector('.bar')?.getBoundingClientRect();
    const button = runner?.querySelector('[data-role="run"]')?.getBoundingClientRect();
    const output = runner?.querySelector('[data-role="output"]')?.getBoundingClientRect();
    const speech = dialogue?.getBoundingClientRect();
    const scaled = [...document.querySelectorAll<HTMLElement>('[data-scene] *')]
      .filter((element) => !['', '1', 'normal'].includes(getComputedStyle(element).zoom))
      .map((element) => element.className);
    return {
      boxes: boxes.filter((box) => box.bottom > box.top),
      ceiling: speech?.top ?? 0,
      frame: {
        barHeight: bar?.height ?? 0,
        barTop: bar?.top ?? 0,
        buttonHeight: button?.height ?? 0,
        buttonWidth: button?.width ?? 0,
        dialogueHeight: speech?.height ?? 0,
        dialogueTop: speech?.top ?? 0,
        editorTop: editor?.top ?? 0,
        outputHeight: output?.height ?? 0,
        outputTop: output?.top ?? 0,
      },
      scaled,
      width: innerWidth,
    };
  }, cursorClass);
  return {
    ceiling: found.ceiling,
    cursor: found.boxes.find((box) => box.name.includes(cursorClass)) ?? null,
    frame: found.frame,
    parts: found.boxes.filter((box) => !box.name.includes(cursorClass)),
    scaled: found.scaled,
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

const expectSteady = (layout: Layout, first: Frame, label: string): void => {
  expect(layout.scaled, `${label}: nothing is scaled`).toEqual([]);
  for (const [name, value] of Object.entries(first)) {
    expect(value, `${label}: ${name} exists`).toBeGreaterThan(0);
    expect(Math.abs((layout.frame[name] ?? 0) - value), `${label}: ${name}`).toBeLessThanOrEqual(
      slack,
    );
  }
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

test.use({ compiler: true });

for (const size of sizes) {
  const name = `${String(size.width)}×${String(size.height)}`;
  test(`${name}: nothing at a gate is covered, cut off, resized or moved, before or after running`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    let first: Frame | null = null;
    for (const gate of checksOf('start')) {
      await openAt(page, gate.id, studentEditor);
      const arrived = await measure(page);
      first ??= arrived.frame;
      expectInside(arrived, `${name}, ${gate.id}, on arrival`);
      expectSteady(arrived, first, `${name}, ${gate.id}, on arrival`);
      await finish(page, gate.id);
      const ran = await measure(page);
      expectInside(ran, `${name}, ${gate.id}, after running`);
      expectSteady(ran, first, `${name}, ${gate.id}, after running`);
    }
  });
}
