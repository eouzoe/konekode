import { checksOf, planOf } from '@konekode/course/units';
import { Schema } from 'effect';

import { expand } from '../src/lib/edit/path';
import { beatSchema, type BeatMeta } from '../src/lib/scene/machine';
import { send, studentEditor } from './gate-view';
import { currentId, type Current } from './scene-view';
import { storedPosition, storedSummary } from './stored';
import { expect } from './test';
import { isHeld, passUntil } from './time';

import type { Page } from '@playwright/test';

const path = '/learn/start/';
const spriteEditor = '[data-code-runner] [data-role="editor"][data-actor="sprite"]';
const unitName = 'start';
const seedPath = '/favicon.ico';

let visits = 0;

const openSeed = async (page: Page): Promise<void> => {
  visits += 1;
  await page.goto(`${seedPath}?visit=${String(visits)}`);
};
const template = [
  '#include <bits/stdc++.h>',
  'using namespace std;',
  '',
  'int main()',
  '{',
  'cin.tie(nullptr)->sync_with_stdio(false);',
  '}',
].join('\n');

const wrap = (body: string): string =>
  [
    '#include <bits/stdc++.h>',
    'using namespace std;',
    '',
    'int main()',
    '{',
    '    cin.tie(nullptr)->sync_with_stdio(false);',
    body,
    '}',
  ].join('\n');

const programs: Record<string, string> = Object.fromEntries(
  checksOf('start').map((check) => [check.id, check.program]),
);

const keysFor = (gate: string): Array<string> =>
  expand(planOf('start', gate)?.path ?? []).map((step) => step.key);

const lessons: Record<string, ReadonlyArray<string>> = Object.fromEntries(
  checksOf('start')
    .map((check) => check.id)
    .filter((gate) => keysFor(gate).length > 0)
    .map((gate) => [gate, keysFor(gate)]),
);

interface Saved {
  readonly cursor: number;
  readonly text: string;
}

interface Setup {
  readonly draft?: Saved;
  readonly unlocked?: ReadonlyArray<string>;
}

const draftAt = (text: string, needle: string): Saved => ({ cursor: text.indexOf(needle), text });

const readyScene = '[data-scene][data-ready="true"]';
const graceMs = 5000;

const sceneSettles = async (page: Page): Promise<void> => {
  const scene = page.locator(readyScene);
  if (!isHeld(page)) {
    await scene.waitFor();
    return;
  }
  try {
    await scene.waitFor({ timeout: graceMs });
  } catch {
    await passUntil(page, async () => (await scene.count()) > 0, { label: 'the unit' });
  }
};

const open = async (
  page: Page,
  position: string | null = null,
  setup: Setup = {},
): Promise<void> => {
  await openSeed(page);
  await page.evaluate(
    async ({ ids, ref, saved, unit }) => {
      localStorage.clear();
      if (saved !== null) {
        localStorage.setItem('cp:draft:start', JSON.stringify(saved));
      }
      await new Promise<null>((resolve) => {
        const removal = indexedDB.deleteDatabase('konekode');
        for (const name of ['success', 'error', 'blocked']) {
          removal.addEventListener(name, () => {
            resolve(null);
          });
        }
      });
      const make = (kind: string, target: string, at: number): object => ({
        at,
        device: 'e2e',
        id: `e2e-${String(at)}`,
        kind,
        ref: target,
        unit,
        version: 1,
      });
      const events = ids.map((id, index) => make('item.unlocked', id, index + 1));
      if (ref !== null) {
        events.push(make('beat.reached', ref, ids.length + 1));
      }
      localStorage.setItem('cp:events:v1', JSON.stringify(events));
    },
    { ids: [...(setup.unlocked ?? [])], ref: position, saved: setup.draft ?? null, unit: unitName },
  );
  await page.goto(path);
  await sceneSettles(page);
};

const writeProgram = async (page: Page, source: string): Promise<void> => {
  const here = await currentId(page);
  try {
    await expect.poll(async () => await storedPosition(page)).toBe(here);
  } catch (error) {
    throw new Error(`${String(error)}\n${await storedSummary(page)}`, { cause: error });
  }
  await page.evaluate((text) => {
    localStorage.setItem('cp:draft:start', JSON.stringify({ cursor: 0, text }));
  }, source);
  await page.reload();
  await page.locator('[data-scene][data-ready="true"]').waitFor();
  await expect(page.locator(studentEditor)).toBeFocused();
};

const status = (page: Page) => page.locator('[data-code-runner] [data-role="status"]');
const output = (page: Page) => page.locator('[data-code-runner] [data-role="output"]');

const typeTemplate = async (page: Page): Promise<void> => {
  await expect(page.locator('[data-typing-drill] [data-role="input"]')).toBeFocused();
  await page.keyboard.type(`i${template}`);
  await page.keyboard.press('Escape');
};

const follow = async (page: Page, keys: ReadonlyArray<string>): Promise<void> => {
  for (const key of keys) {
    await send(page, key);
  }
};

const solve = async (page: Page, gate: string): Promise<void> => {
  const acts = lessons[gate];
  if (acts === undefined) {
    await writeProgram(page, programs[gate] ?? '');
    await page.keyboard.press('Enter');
    return;
  }
  await expect(page.locator(studentEditor)).toBeFocused();
  await follow(page, acts);
};

const editorText = async (page: Page, owner = studentEditor): Promise<string> =>
  await page.evaluate(
    (selector) =>
      [...document.querySelectorAll(`${selector} .cm-line`)]
        .map((line) => {
          const copy = line.cloneNode(true);
          if (copy instanceof Element) {
            for (const ghost of copy.querySelectorAll('.cm-ghost')) {
              ghost.remove();
            }
          }
          return copy.textContent ?? '';
        })
        .join('\n'),
    owner,
  );

const advance = async (page: Page, state: Current): Promise<void> => {
  if (state.waiting && state.wait === 'drill') {
    await typeTemplate(page);
    return;
  }
  if (state.waiting && state.wait === 'run') {
    await solve(page, state.id);
    await expect.poll(async () => await currentId(page), { timeout: 150_000 }).not.toBe(state.id);
    return;
  }
  await page.keyboard.press('Space');
};

const readMetas = async (page: Page): Promise<Array<BeatMeta>> => {
  const raw = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-beat]')].map((beat) => {
      const { after, expect: wanted, id = '', wait = '', when = '' } = beat.dataset;
      return { expect: wanted ?? null, id, next: after === 'next', wait, when };
    }),
  );
  return [...Schema.decodeUnknownSync(Schema.Array(beatSchema))(raw)];
};

export {
  advance,
  draftAt,
  editorText,
  follow,
  lessons,
  open,
  output,
  programs,
  readMetas,
  solve,
  spriteEditor,
  status,
  template,
  typeTemplate,
  wrap,
  writeProgram,
};
