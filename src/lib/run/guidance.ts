import { type Expected } from '@/lib/edit/path';
import { expectedNow, isGuided as follows, type Pressed } from '@/lib/edit/session';
import { ui } from '@/lib/text/ui';
import { describeCommand, describeNext } from '@/lib/typing/hint';
import { messages } from '@/lib/typing/messages';

import { type Desk } from './desk';
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

const notTaught = ui['run.notTaught'];
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

const showGuided = (panel: Panel, active: boolean, idle: string): void => {
  Object.assign(panel.root.dataset, { guided: String(active), wrong: 'false' });
  if (active) {
    panel.hint.textContent = describeExpected(nextOf(panel));
    holdRun(panel);
    return;
  }
  panel.hint.textContent = idle;
};

const showWrong = (panel: Panel): void => {
  panel.root.dataset.wrong = 'true';
  panel.hint.textContent = `${messages.wrong}${describeExpected(nextOf(panel))}`;
};

const showStep = (panel: Panel, pressed: Pressed): void => {
  if (pressed.verdict === 'wrong') {
    showWrong(panel);
  } else {
    panel.root.dataset.wrong = 'false';
    panel.hint.textContent = describeExpected(nextOf(panel));
  }
  holdRun(panel);
  noteStep(placeOf(panel.root), pressed);
};

const mayRun = (panel: Panel): boolean => {
  if (!isGuided(panel.root) || nextOf(panel)?.kind === 'run') {
    return true;
  }
  showWrong(panel);
  return false;
};

export { enterTask, hints, isGuided, mayRun, notTaught, noteCommand, showGuided, showStep, unitOf };
