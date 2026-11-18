import { type Pressed } from '@/lib/edit/session';

import { type Desk } from './desk';
import { createKeys, type Keys } from './keys';
import { noteEntry, noteRefusal, noteStep, type Place } from './note';
import { nextKey, nextOf, quietHint, wrongHint } from './view';

interface Panel {
  readonly button: HTMLButtonElement;
  readonly desk: Desk;
  readonly hint: HTMLElement;
  readonly root: HTMLElement;
}

const calmAfter = 2600;
const calming = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

const isGuided = (root: HTMLElement): boolean => root.dataset.guided === 'true';

const unitOf = (root: HTMLElement): string =>
  root.closest<HTMLElement>('[data-unit]')?.dataset.unit ?? '';

const placeOf = (root: HTMLElement): Place => ({
  beat: root.dataset.beat ?? '',
  unit: unitOf(root),
});

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

const showKeys = (panel: Panel): void => {
  const session = panel.desk.session();
  rowOf(panel.root)?.show(nextKey(session), session.buffer.mode);
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
  panel.button.disabled = nextOf(panel.desk.session())?.kind !== 'run';
};

const settle = (panel: Panel): void => {
  clearTimeout(calming.get(panel.root));
  panel.root.dataset.wrong = 'false';
  panel.hint.textContent = quietHint(panel.desk.session());
};

const showGuided = (panel: Panel, active: boolean, idle: string): void => {
  clearTimeout(calming.get(panel.root));
  Object.assign(panel.root.dataset, { guided: String(active), wrong: 'false' });
  showKeys(panel);
  if (active) {
    panel.hint.textContent = quietHint(panel.desk.session());
    holdRun(panel);
    return;
  }
  panel.hint.textContent = idle;
};

const showWrong = (panel: Panel, pressed: Pressed | null): void => {
  clearTimeout(calming.get(panel.root));
  panel.root.dataset.wrong = 'true';
  panel.hint.textContent = wrongHint(panel.desk.session(), pressed);
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
  if (!isGuided(panel.root) || nextOf(panel.desk.session())?.kind === 'run') {
    return true;
  }
  showWrong(panel, null);
  return false;
};

export { freeHint, idleHints } from './view';

export { enterTask, isGuided, mayRun, noteCommand, showGuided, showKeys, showStep, unitOf };
