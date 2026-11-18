import { expect, type Page } from '@playwright/test';

import { type Rules } from '../src/lib/edit/buffer';
import { effectOf } from '../src/lib/edit/effect';
import { isGuided, press, type Pressed, type Session } from '../src/lib/edit/session';
import { effectText, freeHint, idleHints, quietHint, wrongHint } from '../src/lib/run/view';
import { begin, readView, rulesAt, send, viewOf } from './gate-view';

interface Walk {
  readonly actions: string[];
  effect: string;
  hint: string;
  readonly page: Page;
  readonly rules: Rules;
  session: Session;
  wrong: boolean;
}

const restingHint = (session: Session): string => {
  if (isGuided(session)) {
    return quietHint(session);
  }
  return idleHints.normal ?? '';
};

const arrive = (page: Page, gate: string): Walk => {
  const rules = rulesAt(gate);
  const session = begin(gate, rules);
  return {
    actions: [],
    effect: '',
    hint: restingHint(session),
    page,
    rules,
    session,
    wrong: false,
  };
};

const hintAfter = (before: Session, pressed: Pressed): string => {
  if (!isGuided(before)) {
    return freeHint(pressed);
  }
  if (pressed.verdict === 'wrong') {
    return wrongHint(before, pressed);
  }
  return quietHint(pressed.session);
};

const tap = async (walk: Walk, key: string): Promise<Pressed> => {
  const before = walk.session;
  const pressed = press(before, key, walk.rules);
  const told = effectOf(before.buffer, pressed.session.buffer, key);
  walk.actions.push(key);
  Object.assign(walk, {
    hint: hintAfter(before, pressed),
    session: pressed.session,
    wrong: pressed.verdict === 'wrong',
  });
  if (told !== null) {
    walk.effect = effectText(told);
  }
  await send(walk.page, key);
  return pressed;
};

const expectSame = async (walk: Walk, label: string): Promise<void> => {
  const { effect, hint, rules, wrong } = walk;
  const wanted = viewOf(walk.session, { effect, hint, rules, wrong });
  await expect.poll(async () => await readView(walk.page), { message: label }).toEqual(wanted);
};

export { arrive, expectSame, tap, type Walk };
