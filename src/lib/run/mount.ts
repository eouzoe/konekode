import { engine } from '@/lib/complete/current';
import { createBuffer, lastColumn, type Buffer, type Rules } from '@/lib/edit/buffer';
import { type Pressed } from '@/lib/edit/session';
import { planOf, starterOf } from '@/units/index';

import { createDesk, type Desk } from './desk';
import { readDraft, writeDraft } from './draft';
import {
  enterTask,
  freeHint,
  idleHints,
  isGuided,
  mayRun,
  noteCommand,
  showGuided,
  showKeys,
  showStep,
  unitOf,
} from './guidance';
import { noteFailure, noteRun } from './note';
import { busyStatus, describe, failed, type View } from './outcome';
import { type Outcome } from './protocol';
import { isKnown, loadedPercent, runProgram, warmUp, watchLoading } from './runner';
import { createStage } from './stage';

interface Parts {
  readonly button: HTMLButtonElement;
  readonly desk: Desk;
  readonly fresh: boolean;
  readonly hint: HTMLElement;
  readonly input: HTMLElement;
  readonly output: HTMLElement;
  readonly root: HTMLElement;
  readonly status: HTMLElement;
}

const firstTouch = ['pointerdown', 'keydown'];
const find = <Kind extends HTMLElement>(
  root: Element,
  role: string,
  kind: new () => Kind,
): Kind => {
  const found = root.querySelector(`[data-role="${role}"]`);
  if (!(found instanceof kind)) {
    throw new TypeError(`找不到 ${role}`);
  }
  return found;
};

const show = (parts: Parts, view: View): void => {
  parts.root.dataset.state = view.state;
  parts.status.textContent = view.status;
  parts.output.textContent = view.text;
};

const announce = (parts: Parts, outcome: Outcome, beat: string): void => {
  if (outcome.kind === 'finished' && outcome.exitCode === 0) {
    const detail = { beat, output: outcome.output };
    parts.root.dispatchEvent(new CustomEvent('run:ok', { bubbles: true, detail }));
  }
};

const attending = (parts: Parts): string => parts.root.dataset.beat ?? '';

const isArmed = (parts: Parts): boolean => parts.root.dataset.armed === 'true';

const arm = (parts: Parts, armed: boolean): void => {
  parts.root.dataset.armed = String(armed);
  parts.button.disabled = !armed;
  parts.desk.setArmed(armed);
};

interface Finished {
  readonly beat: string;
  readonly forced: boolean;
  readonly outcome: Outcome;
}

const finish = (parts: Parts, { beat, forced, outcome }: Finished): void => {
  if (attending(parts) !== beat) {
    return;
  }
  show(parts, describe(outcome));
  if (!forced) {
    announce(parts, outcome, beat);
  }
};

const begin = (parts: Parts): void => {
  parts.root.dispatchEvent(new CustomEvent('run:begin', { bubbles: true }));
  parts.button.disabled = true;
  show(parts, { state: 'busy', status: busyStatus(loadedPercent()), text: '' });
};

const fail = (parts: Parts, beat: string, error: unknown): void => {
  noteFailure({ beat, unit: unitOf(parts.root) }, error);
  if (attending(parts) === beat) {
    show(parts, failed(error));
  }
};

const runOnce = async (parts: Parts, beat: string, forced: boolean): Promise<void> => {
  const source = parts.desk.text(forced);
  const input = parts.input.textContent;
  const began = performance.now();
  const outcome = await runProgram(source, input);
  const place = { beat, unit: unitOf(parts.root) };
  const known = isKnown(source, input);
  noteRun({ forced, input, known, outcome, place, source, took: performance.now() - began });
  finish(parts, { beat, forced, outcome });
};

const execute = async (parts: Parts, forced: boolean): Promise<void> => {
  if (parts.root.dataset.state === 'busy' || (!forced && !isArmed(parts))) {
    return;
  }
  const beat = attending(parts);
  begin(parts);
  try {
    await runOnce(parts, beat, forced);
  } catch (error) {
    fail(parts, beat, error);
  } finally {
    parts.button.disabled = !isArmed(parts);
  }
};

const preload = (): void => {
  const controller = new AbortController();
  const { signal } = controller;
  for (const name of firstTouch) {
    document.addEventListener(
      name,
      () => {
        controller.abort();
        void warmUp();
      },
      { signal },
    );
  }
};

const rules = (): Rules => ({ keys: engine.keys(), pairs: engine.pairs() });

const startBuffer = (root: HTMLElement, parent: HTMLElement): Buffer => {
  const saved = readDraft(root.dataset.draft ?? '') ?? {
    cursor: 0,
    text: parent.dataset.source ?? '',
  };
  return createBuffer(saved.text, Math.min(saved.cursor, lastColumn(saved.text, saved.cursor)));
};

const makeDesk = (root: HTMLElement, onPress: (pressed: Pressed) => void): Desk => {
  const parent = find(root, 'editor', HTMLElement);
  const name = root.dataset.draft ?? '';
  return createDesk({
    onChange: (buffer) => {
      if (name !== '') {
        writeDraft(name, { cursor: buffer.cursor, text: buffer.text });
      }
    },
    onPress,
    parent,
    rules,
    start: startBuffer(root, parent),
  });
};

const guide = (parts: Parts): void => {
  const stage = createStage({
    arm: (armed) => {
      arm(parts, armed);
    },
    attend: (beat) => {
      parts.root.dataset.beat = beat;
    },
    clear: () => {
      parts.desk.hush();
      show(parts, { state: 'idle', status: '', text: '' });
    },
    desk: parts.desk,
    entered: (mode) => {
      enterTask(parts, mode);
    },
    fresh: parts.fresh,
    guided: (active) => {
      showGuided(parts, active, idleHints.normal ?? '');
    },
    keycap: find(parts.root, 'keycap', HTMLElement),
    origin: starterOf(unitOf(parts.root)) ?? parts.desk.text(false),
    plan: (beat) => planOf(unitOf(parts.root), beat),
    rules,
    run: () => {
      void execute(parts, true);
    },
  });
  arm(parts, false);
  parts.hint.textContent = idleHints.normal ?? '';
  parts.root.addEventListener('runner:stage', (event) => {
    if (event instanceof CustomEvent) {
      stage(event.detail);
    }
  });
};

const buildParts = (root: HTMLElement, onPress: (pressed: Pressed) => void): Parts => ({
  button: find(root, 'run', HTMLButtonElement),
  desk: makeDesk(root, onPress),
  fresh: readDraft(root.dataset.draft ?? '') === null,
  hint: find(root, 'hint', HTMLElement),
  input: find(root, 'stdin', HTMLElement),
  output: find(root, 'output', HTMLElement),
  root,
  status: find(root, 'status', HTMLElement),
});

const report = (parts: Parts, pressed: Pressed): void => {
  if (isGuided(parts.root)) {
    showStep(parts, pressed);
  } else {
    parts.hint.textContent = freeHint(pressed);
    showKeys(parts);
    noteCommand(parts.root, pressed);
  }
  if (pressed.runs) {
    parts.root.dispatchEvent(new CustomEvent('runner:run'));
  }
};

const mountRunner = (root: HTMLElement): void => {
  const listeners: ((pressed: Pressed) => void)[] = [];
  const parts = buildParts(root, (pressed) => {
    for (const listener of listeners) {
      listener(pressed);
    }
  });
  listeners.push((pressed) => {
    report(parts, pressed);
  });
  const start = (): void => {
    if (mayRun(parts)) {
      void execute(parts, false);
    }
  };
  watchLoading((percent) => {
    if (root.dataset.state === 'busy') {
      parts.status.textContent = busyStatus(percent);
    }
  });
  parts.button.addEventListener('click', () => {
    parts.button.blur();
    start();
  });
  root.addEventListener('runner:run', start);
  guide(parts);
};

const mountRunners = (): void => {
  const roots = [...document.querySelectorAll<HTMLElement>('[data-code-runner]')];
  for (const root of roots) {
    mountRunner(root);
  }
  if (roots.length > 0) {
    preload();
  }
};

export { mountRunners };
