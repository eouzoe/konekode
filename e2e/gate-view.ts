import { catalog } from '../src/lib/complete/catalog';
import { createEngine } from '../src/lib/complete/engine';
import { createBuffer, type Rules } from '../src/lib/edit/buffer';
import { goalOf, type Hint } from '../src/lib/edit/goal';
import { expand, keysOf } from '../src/lib/edit/path';
import { knownKeys, run } from '../src/lib/edit/step';
import { nextKey } from '../src/lib/run/view';
import { beatsOf, planOf, starterOf } from '../src/units/index';

import type { Session } from '../src/lib/edit/session';
import type { Page } from '@playwright/test';

interface View {
  readonly effect: string;
  readonly ghosts: ReadonlyArray<string>;
  readonly hint: string;
  readonly mode: string;
  readonly next: string;
  readonly struck: ReadonlyArray<string>;
  readonly text: string;
  readonly wrong: boolean;
}

interface Shown {
  readonly effect: string;
  readonly hint: string;
  readonly rules: Rules;
  readonly wrong: boolean;
}

const studentEditor = '[data-code-runner] [data-role="editor"][data-actor="student"]';
const newline = '\n';
const modes: Readonly<Record<string, string>> = {
  insert: '-- INSERT --',
  normal: '-- NORMAL --',
};

const rulesAt = (gate: string): Rules => {
  const beats = beatsOf('start');
  const upTo = beats.findIndex((beat) => beat.id === gate) + 1;
  const unlocked = new Set(beats.slice(0, upTo).flatMap((beat) => beat.unlock ?? []));
  const engine = createEngine(catalog, () => unlocked);
  return { keys: engine.keys(), pairs: engine.pairs() };
};

const begin = (gate: string, rules: Rules): Session => {
  const plan = planOf('start', gate);
  const everything = { keys: knownKeys, pairs: rules.pairs };
  const origin = createBuffer(starterOf('start') ?? '');
  const start = run(origin, keysOf(plan?.history ?? []), everything);
  return { at: 0, buffer: start, path: expand(plan?.path ?? []) };
};

const struckIn = (line: string, at: number, hints: ReadonlyArray<Hint>): string => {
  const here = hints.filter((hint) => hint.kind !== 'line' && hint.line === at);
  if (here.some((hint) => hint.kind === 'drop')) {
    return line;
  }
  return here
    .flatMap((hint) => {
      if (hint.kind === 'remove') {
        return [hint];
      }
      return [];
    })
    .toSorted((one, other) => one.from - other.from)
    .map((hint) => line.slice(hint.from, hint.to))
    .join('');
};

const struckOf = (session: Session, rules: Rules): Array<string> => {
  const hints = goalOf(session, rules);
  return session.buffer.text
    .split(newline)
    .map((line, at) => struckIn(line, at, hints))
    .filter((part) => part !== '');
};

const ghostsOf = (session: Session, rules: Rules): Array<string> =>
  goalOf(session, rules)
    .flatMap((hint) => {
      if (hint.kind === 'line' || hint.kind === 'insert') {
        return [hint.text];
      }
      return [];
    })
    .toSorted();

const litKey = (session: Session, rules: Rules): string => {
  const next = nextKey(session);
  if (rules.keys.has(next)) {
    return next;
  }
  return '';
};

const viewOf = (session: Session, shown: Shown): View => ({
  effect: shown.effect,
  ghosts: ghostsOf(session, shown.rules),
  hint: shown.hint,
  mode: modes[session.buffer.mode] ?? '',
  next: litKey(session, shown.rules),
  struck: struckOf(session, shown.rules),
  text: session.buffer.text,
  wrong: shown.wrong,
});

const readView = async (page: Page): Promise<View> =>
  await page.evaluate(() => {
    const runner = document.querySelector<HTMLElement>('[data-code-runner]');
    const editor = runner?.querySelector('[data-role="editor"]');
    const lines = [...(editor?.querySelectorAll('.cm-line') ?? [])];
    const plainAt = (at: number): string => {
      const copy = lines[at]?.cloneNode(true);
      if (!(copy instanceof Element)) {
        return '';
      }
      for (const ghost of copy.querySelectorAll('.cm-ghost')) {
        ghost.remove();
      }
      return copy.textContent;
    };
    const struckAt = (at: number): string => {
      const line = lines[at];
      if (line?.classList.contains('cm-ghost-drop') === true) {
        return plainAt(at);
      }
      return [...(line?.querySelectorAll('.cm-ghost-remove') ?? [])]
        .map((found) => found.textContent)
        .join('');
    };
    const role = (name: string): string =>
      runner?.querySelector(`[data-role="${name}"]`)?.textContent ?? '';
    const ghosts = [...(editor?.querySelectorAll('.cm-ghost') ?? [])];
    return {
      effect: role('effect'),
      ghosts: ghosts.map((found) => found.textContent).toSorted(),
      hint: role('hint'),
      mode: role('mode'),
      next: runner?.querySelector('[data-role="keys"] kbd[data-next="true"]')?.textContent ?? '',
      struck: lines.map((_line, at) => struckAt(at)).filter((part) => part !== ''),
      text: lines.map((_line, at) => plainAt(at)).join('\n'),
      wrong: runner?.dataset.wrong === 'true',
    };
  });

const send = async (page: Page, key: string): Promise<void> => {
  if (key.length === 1) {
    await page.keyboard.type(key);
    return;
  }
  await page.keyboard.press(key);
};

export { begin, readView, rulesAt, send, studentEditor, viewOf, type View };
