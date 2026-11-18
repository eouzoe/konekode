import { type Expected } from '@/lib/edit/path';
import { expectedNow, isGuided as follows, type Pressed } from '@/lib/edit/session';
import { ui } from '@/lib/text/ui';
import { describeCommand, describeNext, needsTelling } from '@/lib/typing/hint';
import { messages } from '@/lib/typing/messages';

import { type Desk } from './desk';
import { createKeys, type Keys } from './keys';
import { noteEntry, noteRefusal, noteStep, type Place } from './note';

interface Panel {
  readonly button: HTMLButtonElement;
  readonly desk: Desk;
  readonly hint: HTMLElement;
  readonly root: HTMLElement;
}

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

const calmAfter = 2600;
const calming = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

const refusalOf = (key: string): string => {
  if (key.startsWith('Arrow')) {
    return ui['run.noArrows'];
  }
  return ui['run.notTaught'];
};
const hints: Readonly<Record<string, string>> = {
  insert: ui['run.hintInsert'],
  normal: ui['typing.runNow'],
};

const isGuided = (root: HTMLElement): boolean => root.dataset.guided === 'true';

const unitOf = (root: HTMLElement): string =>
  root.closest<HTMLElement>('[data-unit]')?.dataset.unit ?? '';

const placeOf = (root: HTMLElement): Place => ({
  beat: root.dataset.beat ?? '',
  unit: unitOf(root),
});

const nextOf = (panel: Panel): Expected | null => {
  const session = panel.desk.session();
  if (!follows(session)) {
    return null;
  }
  return expectedNow(session);
};

const rows = new WeakMap<HTMLElement, Keys>();

const rowOf = (root: HTMLElement): Keys | null => {
  const known = rows.get(root);
  const element = root.querySelector<HTMLElement>('[data-role="keys"]');
  if (known !== undefined || element === null) {
    return known ?? null;
  }
  const made = createKeys(element, unitOf(root));
  rows.set(root, made);
  return made;
};

const nextCommand = (panel: Panel): string => {
  const next = nextOf(panel);
  if (next?.kind === 'command' && next.key.length === 1) {
    return next.key;
  }
  return '';
};

const showKeys = (panel: Panel): void => {
  rowOf(panel.root)?.show(nextCommand(panel), panel.desk.session().buffer.mode);
};

const enterTask = (panel: Panel, mode: string): void => {
  noteEntry(placeOf(panel.root), mode, panel.desk.text(false));
};

const noteCommand = (root: HTMLElement, pressed: Pressed): void => {
  if (pressed.verdict === 'refused') {
    noteRefusal(placeOf(root), pressed.key);
  }
};

const holdRun = (panel: Panel): void => {
  panel.button.disabled = nextOf(panel)?.kind !== 'run';
};

const settle = (panel: Panel): void => {
  clearTimeout(calming.get(panel.root));
  panel.root.dataset.wrong = 'false';
  panel.hint.textContent = describeQuietly(nextOf(panel));
};

const showGuided = (panel: Panel, active: boolean, idle: string): void => {
  clearTimeout(calming.get(panel.root));
  Object.assign(panel.root.dataset, { guided: String(active), wrong: 'false' });
  showKeys(panel);
  if (active) {
    panel.hint.textContent = describeQuietly(nextOf(panel));
    holdRun(panel);
    return;
  }
  panel.hint.textContent = idle;
};

const showWrong = (panel: Panel, pressed: Pressed | null): void => {
  clearTimeout(calming.get(panel.root));
  panel.root.dataset.wrong = 'true';
  panel.hint.textContent = `${leadOf(pressed)}${describeWanted(nextOf(panel))}`;
  rowOf(panel.root)?.nudge();
  calming.set(
    panel.root,
    setTimeout(() => {
      settle(panel);
    }, calmAfter),
  );
};

const showStep = (panel: Panel, pressed: Pressed): void => {
  if (pressed.verdict === 'wrong') {
    showWrong(panel, pressed);
  } else {
    settle(panel);
  }
  holdRun(panel);
  showKeys(panel);
  noteStep(placeOf(panel.root), pressed);
};

const mayRun = (panel: Panel): boolean => {
  if (!isGuided(panel.root) || nextOf(panel)?.kind === 'run') {
    return true;
  }
  showWrong(panel, null);
  return false;
};

export {
  enterTask,
  hints,
  isGuided,
  mayRun,
  refusalOf,
  noteCommand,
  showGuided,
  showKeys,
  showStep,
  unitOf,
};
