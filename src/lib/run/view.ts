import { type Effect } from '@/lib/edit/effect';
import { type Expected } from '@/lib/edit/path';
import { expectedNow, isGuided, type Pressed, type Session } from '@/lib/edit/session';
import { say, ui } from '@/lib/text/ui';
import { describeCommand, describeNext, needsTelling } from '@/lib/typing/hint';
import { messages } from '@/lib/typing/messages';

const calmAfter = 2600;

const named: Record<string, string> = {
  Backspace: `${messages.press}Backspace`,
  Enter: messages.pressEnter,
  Escape: messages.pressEsc,
};

const describeExpected = (expected: Expected | null): string => {
  if (expected === null) {
    return '';
  }
  if (expected.kind === 'run') {
    return messages.runNow;
  }
  if (expected.kind === 'text') {
    return describeNext(expected.key);
  }
  return named[expected.key] ?? describeCommand(expected.key);
};

const describeQuietly = (expected: Expected | null): string => {
  if (expected?.kind === 'text' && !needsTelling(expected.key)) {
    return '';
  }
  return describeExpected(expected);
};

const describeWanted = (expected: Expected | null): string => {
  if (expected?.kind === 'run') {
    return messages.pressEnter;
  }
  return describeExpected(expected);
};

const reasons: Readonly<Record<string, string>> = {
  case: ui['guide.case'],
  'early-leave': ui['guide.earlyLeave'],
  'early-run': ui['guide.earlyRun'],
  'need-insert': ui['guide.needInsert'],
  'no-delete': messages.noDelete,
};

const leadOf = (pressed: Pressed | null): string => {
  if (pressed === null) {
    return ui['guide.earlyRun'];
  }
  if (pressed.key.startsWith('Arrow')) {
    return ui['guide.arrow'];
  }
  return reasons[pressed.cause] ?? messages.wrong;
};

const nextOf = (session: Session): Expected | null => {
  if (!isGuided(session)) {
    return null;
  }
  return expectedNow(session);
};

const quietHint = (session: Session): string => describeQuietly(nextOf(session));

const wrongHint = (session: Session, pressed: Pressed | null): string =>
  `${leadOf(pressed)}${describeWanted(nextOf(session))}`;

const nextKey = (session: Session): string => {
  const next = nextOf(session);
  if (next?.kind === 'command' && next.key.length === 1) {
    return next.key;
  }
  return '';
};

const refusalOf = (key: string): string => {
  if (key.startsWith('Arrow')) {
    return ui['run.noArrows'];
  }
  return ui['run.notTaught'];
};

const idleHints: Readonly<Record<string, string>> = {
  insert: ui['run.hintInsert'],
  normal: ui['typing.runNow'],
};

const freeHint = (pressed: Pressed): string => {
  if (pressed.verdict === 'refused') {
    return refusalOf(pressed.key);
  }
  return idleHints[pressed.session.buffer.mode] ?? '';
};

const effectText = (effect: Effect): string =>
  say(`effect.${effect.kind}`, { count: String(effect.count), keys: String(effect.keys) });

export { calmAfter, effectText, freeHint, idleHints, nextKey, nextOf, quietHint, wrongHint };
