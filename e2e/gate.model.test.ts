import { expect, test, type Page } from '@playwright/test';

import { type Rules } from '../src/lib/edit/buffer';
import { effectOf } from '../src/lib/edit/effect';
import { expectedNow, press, type Session } from '../src/lib/edit/session';
import { effectText, quietHint, wrongHint } from '../src/lib/run/view';
import { checksOf, planOf } from '../src/units/index';
import { openAt } from './fuzz-support';
import { begin, readView, rulesAt, send, studentEditor, viewOf, type View } from './gate-support';

const gates = checksOf('start').filter((gate) => (planOf('start', gate.id)?.path.length ?? 0) > 0);
const never = '~';

const swapCase = (key: string): string => {
  if (key.length !== 1) {
    return never;
  }
  if (key.toLowerCase() === key) {
    return key.toUpperCase();
  }
  return key.toLowerCase();
};

const upcomingText = ({ at, path }: Session): string =>
  path.slice(at).find((expected) => expected.kind === 'text')?.key ?? never;

const wrongKeys = (session: Session): string[] => {
  const wanted = expectedNow(session)?.key ?? '';
  const candidates = [
    never,
    swapCase(wanted),
    'Backspace',
    'Delete',
    'Enter',
    'Escape',
    upcomingText(session),
    'ArrowLeft',
    'ArrowDown',
  ];
  return [...new Set(candidates)].filter((key) => key !== wanted && key !== '');
};

interface Walk {
  effect: string;
  readonly page: Page;
  readonly rules: Rules;
  session: Session;
}

const same = async (walk: Walk, wanted: View, label: string): Promise<void> => {
  await expect.poll(async () => await readView(walk.page), { message: label }).toEqual(wanted);
};

const tryWrong = async (walk: Walk, key: string, label: string): Promise<void> => {
  const { rules } = walk;
  const pressed = press(walk.session, key, rules);
  expect(pressed.verdict, label).toBe('wrong');
  await send(walk.page, key);
  const hint = wrongHint(walk.session, pressed);
  await same(walk, viewOf(walk.session, { effect: walk.effect, hint, rules, wrong: true }), label);
};

const goRight = async (walk: Walk, key: string, label: string): Promise<void> => {
  const { rules } = walk;
  const before = walk.session.buffer;
  const pressed = press(walk.session, key, rules);
  expect(pressed.verdict, label).toBe('right');
  await send(walk.page, key);
  walk.session = pressed.session;
  const told = effectOf(before, walk.session.buffer, key);
  if (told !== null) {
    walk.effect = effectText(told);
  }
  const hint = quietHint(walk.session);
  await same(walk, viewOf(walk.session, { effect: walk.effect, hint, rules, wrong: false }), label);
};

for (const gate of gates) {
  test(`${gate.id}: after every key, right or wrong, the page shows what the rules say`, async ({
    page,
  }) => {
    await openAt(page, gate.id, studentEditor);
    const rules = rulesAt(gate.id);
    const walk: Walk = { effect: '', page, rules, session: begin(gate.id, rules) };
    const first = { effect: '', hint: quietHint(walk.session), rules, wrong: false };
    await same(walk, viewOf(walk.session, first), 'on arrival');
    for (const [at, expected] of walk.session.path.entries()) {
      for (const key of wrongKeys(walk.session)) {
        await tryWrong(walk, key, `step ${String(at)}, wrong key ${key}`);
      }
      if (expected.kind === 'run') {
        break;
      }
      await goRight(walk, expected.key, `step ${String(at)}, right key ${expected.key}`);
    }
    expect(walk.session.buffer.text).toBe(gate.program);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-code-runner]')).toHaveAttribute('data-armed', 'false', {
      timeout: 60_000,
    });
  });
}
