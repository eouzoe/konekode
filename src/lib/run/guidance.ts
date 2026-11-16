import { type Editor } from './editor';
import { describeExpected, describeStep, type Step } from './guided';
import { noteEntry, noteStep, type Place } from './note';

interface Panel {
  readonly button: HTMLButtonElement;
  readonly editor: Editor;
  readonly hint: HTMLElement;
  readonly root: HTMLElement;
}

const isGuided = (root: HTMLElement): boolean => root.dataset.guided === 'true';

const unitOf = (root: HTMLElement): string =>
  root.closest<HTMLElement>('[data-unit]')?.dataset.unit ?? '';

const placeOf = (root: HTMLElement): Place => ({
  beat: root.dataset.beat ?? '',
  unit: unitOf(root),
});

const enterTask = (root: HTMLElement, mode: string): void => {
  noteEntry(placeOf(root), mode);
};

const holdRun = (panel: Panel): void => {
  panel.button.disabled = panel.editor.nextStep()?.kind !== 'run';
};

const showGuided = (panel: Panel, active: boolean, idle: string): void => {
  Object.assign(panel.root.dataset, { guided: String(active), wrong: 'false' });
  if (active) {
    panel.hint.textContent = describeExpected(panel.editor.nextStep());
    holdRun(panel);
    return;
  }
  panel.hint.textContent = idle;
};

const showStep = (panel: Panel, step: Step): void => {
  panel.root.dataset.wrong = String(step.verdict !== 'right');
  panel.hint.textContent = describeStep(step.verdict, panel.editor.nextStep());
  holdRun(panel);
  noteStep(placeOf(panel.root), step);
};

const mayRun = (panel: Panel): boolean => {
  if (!isGuided(panel.root) || panel.editor.nextStep()?.kind === 'run') {
    return true;
  }
  panel.root.dataset.wrong = 'true';
  panel.hint.textContent = describeStep('wrong', panel.editor.nextStep());
  return false;
};

export { enterTask, isGuided, mayRun, showGuided, showStep, unitOf };
