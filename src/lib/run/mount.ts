import { readDraft, writeDraft } from './draft';
import { createEditor, type Editor } from './editor';
import { explain } from './explain';
import { type Outcome } from './protocol';
import { loadedPercent, runProgram, warmUp, watchLoading } from './runner';
import { createStage } from './stage';

interface Parts {
  readonly button: HTMLButtonElement;
  readonly editor: Editor;
  readonly hint: HTMLElement;
  readonly input: HTMLTextAreaElement;
  readonly output: HTMLElement;
  readonly root: HTMLElement;
  readonly status: HTMLElement;
}

interface View {
  readonly state: string;
  readonly status: string;
  readonly text: string;
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

const describe = (outcome: Outcome): View => {
  if (outcome.kind === 'compile-error') {
    return { state: 'error', status: '編譯沒有過', text: explain(outcome.message) };
  }
  if (outcome.kind === 'timeout') {
    return { state: 'error', status: '跑太久，已經停下來', text: '' };
  }
  if (outcome.kind === 'crashed') {
    return { state: 'error', status: '執行時出錯', text: outcome.message };
  }
  if (outcome.exitCode !== 0) {
    return { state: 'error', status: '程式中途結束', text: outcome.output };
  }
  return { state: 'ok', status: '執行完成', text: outcome.output };
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

const execute = async (parts: Parts, forced: boolean): Promise<void> => {
  if (parts.root.dataset.state === 'busy' || (!forced && !isArmed(parts))) {
    return;
  }
  const beat = attending(parts);
  begin(parts);
  try {
    const outcome = await runProgram(parts.editor.getText(), parts.input.value);
    finish(parts, { beat, forced, outcome });
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

const makeEditor = (root: HTMLElement, run: () => void): Editor => {
  const parent = find(root, 'editor', HTMLElement);
  const name = root.dataset.draft ?? '';
  const text = readDraft(name) ?? parent.dataset.source ?? '';
  parent.replaceChildren();
  return createEditor({
    onChange: (next) => {
      if (name !== '') {
        writeDraft(name, next);
      }
    },
    onRun: run,
    parent,
    text,
  });
};

const hints: Record<string, string> = {
  insert: 'Esc 回到一般模式',
  normal: 'Enter 執行',
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
    editor: parts.editor,
    keycap: find(parts.root, 'keycap', HTMLElement),
    run: () => {
      void execute(parts, true);
    },
  });
  arm(parts, false);
  parts.hint.textContent = hints.normal ?? '';
  parts.editor.onMode((mode) => {
    parts.hint.textContent = hints[mode] ?? '';
  });
  parts.root.addEventListener('runner:stage', (event) => {
    if (event instanceof CustomEvent) {
      stage(event.detail);
    }
  });
};

const mountRunner = (root: HTMLElement): void => {
  const run = (): void => {
    root.dispatchEvent(new CustomEvent('runner:run'));
  };
  const parts: Parts = {
    button: find(root, 'run', HTMLButtonElement),
    editor: makeEditor(root, run),
    hint: find(root, 'hint', HTMLElement),
    input: find(root, 'stdin', HTMLTextAreaElement),
    output: find(root, 'output', HTMLElement),
    root,
    status: find(root, 'status', HTMLElement),
  };
  const start = (): void => {
    void execute(parts, false);
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
