import { planOf, starterOf } from '@/units/index';

import { readDraft, writeDraft } from './draft';
import { createEditor, forgetVimMemory, type Editor } from './editor';
import { enterTask, isGuided, mayRun, showGuided, showStep, unitOf } from './guidance';
import { type Step } from './guided';
import { noteRun } from './note';
import { describe, type View } from './outcome';
import { type Outcome } from './protocol';
import { loadedPercent, runProgram, warmUp, watchLoading } from './runner';
import { createStage, type Actor } from './stage';

interface Parts {
  readonly button: HTMLButtonElement;
  readonly fresh: boolean;
  readonly editor: Editor;
  readonly hint: HTMLElement;
  readonly input: HTMLTextAreaElement;
  readonly output: HTMLElement;
  readonly root: HTMLElement;
  readonly sprite: Editor;
  readonly status: HTMLElement;
}

const firstTouch = ['pointerdown', 'keydown'];
const complete = 100;

const busyStatus = (percent: number): string => {
  if (percent < complete) {
    return `正在下載編譯器（${String(percent)}%），只有第一次需要等`;
  }
  return '執行中';
};

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
  parts.editor.setArmed(armed);
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
  parts.button.disabled = true;
  show(parts, { state: 'busy', status: busyStatus(loadedPercent()), text: '' });
};

const fail = (parts: Parts, beat: string, error: unknown): void => {
  if (attending(parts) === beat) {
    show(parts, { state: 'error', status: '執行不了', text: String(error) });
  }
};

const sourceOf = (parts: Parts, forced: boolean): string => {
  if (forced) {
    return parts.sprite.getText();
  }
  return parts.editor.getText();
};

const runOnce = async (parts: Parts, beat: string, forced: boolean): Promise<void> => {
  const source = sourceOf(parts, forced);
  const input = parts.input.value;
  const began = performance.now();
  const outcome = await runProgram(source, input);
  const place = { beat, unit: unitOf(parts.root) };
  noteRun({ forced, input, outcome, place, source, took: performance.now() - began });
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

const notTaught = '這個鍵還沒學到，先不能用喔！';
const normalHint = 'Enter 執行';

const commandHint = (refused: boolean): string => {
  if (refused) {
    return notTaught;
  }
  return normalHint;
};

interface Hooks {
  readonly run: () => void;
  readonly step: (step: Step) => void;
}

const makeEditor = (root: HTMLElement, { run, step }: Hooks): Editor => {
  const parent = find(root, 'editor', HTMLElement);
  const name = root.dataset.draft ?? '';
  const saved = readDraft(name) ?? { cursor: 0, text: parent.dataset.source ?? '' };
  parent.replaceChildren();
  return createEditor({
    cursor: saved.cursor,
    onChange: (next) => {
      if (name !== '') {
        writeDraft(name, next);
      }
    },
    onCommand: (refused) => {
      if (!isGuided(root)) {
        find(root, 'hint', HTMLElement).textContent = commandHint(refused);
      }
    },
    onRun: run,
    onStep: step,
    parent,
    text: saved.text,
  });
};

const makeSprite = (root: HTMLElement): Editor =>
  createEditor({ cursor: 0, parent: find(root, 'sprite-editor', HTMLElement), text: '' });

const showActor = (root: HTMLElement, actor: Actor): void => {
  root.dataset.actor = actor;
  find(root, 'editor', HTMLElement).hidden = actor !== 'student';
  find(root, 'sprite-editor', HTMLElement).hidden = actor !== 'sprite';
};

const hints: Record<string, string> = {
  insert: 'Esc 回到一般模式',
  normal: normalHint,
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
      show(parts, { state: 'idle', status: '', text: '' });
    },
    entered: (mode) => {
      enterTask(parts.root, mode);
    },
    forget: forgetVimMemory,
    fresh: parts.fresh,
    guided: (active) => {
      showGuided(parts, active, hints.normal ?? '');
    },
    keycap: find(parts.root, 'keycap', HTMLElement),
    origin: { cursor: 0, text: starterOf(unitOf(parts.root)) ?? parts.editor.getText() },
    plan: (beat) => planOf(unitOf(parts.root), beat),
    run: () => {
      void execute(parts, true);
    },
    show: (actor) => {
      showActor(parts.root, actor);
    },
    sprite: parts.sprite,
    student: parts.editor,
  });
  arm(parts, false);
  parts.hint.textContent = hints.normal ?? '';
  parts.editor.onMode((mode) => {
    if (!isGuided(parts.root)) {
      parts.hint.textContent = hints[mode] ?? '';
    }
  });
  parts.root.addEventListener('runner:stage', (event) => {
    if (event instanceof CustomEvent) {
      stage(event.detail);
    }
  });
};

const buildParts = (root: HTMLElement, hooks: Hooks): Parts => ({
  button: find(root, 'run', HTMLButtonElement),
  editor: makeEditor(root, hooks),
  fresh: readDraft(root.dataset.draft ?? '') === null,
  hint: find(root, 'hint', HTMLElement),
  input: find(root, 'stdin', HTMLTextAreaElement),
  output: find(root, 'output', HTMLElement),
  root,
  sprite: makeSprite(root),
  status: find(root, 'status', HTMLElement),
});

const mountRunner = (root: HTMLElement): void => {
  const listeners: ((step: Step) => void)[] = [];
  const parts = buildParts(root, {
    run: () => {
      root.dispatchEvent(new CustomEvent('runner:run'));
    },
    step: (step) => {
      for (const listener of listeners) {
        listener(step);
      }
    },
  });
  listeners.push((step) => {
    showStep(parts, step);
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
  parts.button.addEventListener('click', start);
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
