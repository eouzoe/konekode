import { type Outcome } from './protocol';
import { runProgram, warmUp } from './runner';

const indent = '    ';
const firstTouch = ['pointerdown', 'keydown'];

interface Parts {
  readonly button: HTMLButtonElement;
  readonly input: HTMLTextAreaElement;
  readonly output: HTMLElement;
  readonly root: HTMLElement;
  readonly source: HTMLTextAreaElement;
  readonly status: HTMLElement;
}

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

interface View {
  readonly state: string;
  readonly status: string;
  readonly text: string;
}

const describe = (outcome: Outcome): View => {
  if (outcome.kind === 'compile-error') {
    return { state: 'error', status: '編譯沒有過', text: outcome.message };
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

const announce = (parts: Parts, outcome: Outcome): void => {
  if (outcome.kind === 'finished' && outcome.exitCode === 0) {
    parts.root.dispatchEvent(new CustomEvent('run:ok', { bubbles: true, detail: outcome.output }));
  }
};

const execute = async (parts: Parts): Promise<void> => {
  parts.button.disabled = true;
  show(parts, { state: 'busy', status: '執行中（第一次要先下載編譯器，會比較久）', text: '' });
  try {
    const outcome = await runProgram(parts.source.value, parts.input.value);
    show(parts, describe(outcome));
    announce(parts, outcome);
  } catch (error) {
    show(parts, { state: 'error', status: '執行不了', text: String(error) });
  } finally {
    parts.button.disabled = false;
  }
};

const insertIndent = (event: KeyboardEvent, source: HTMLTextAreaElement): void => {
  if (event.key !== 'Tab' || event.shiftKey || event.isComposing) {
    return;
  }
  event.preventDefault();
  source.setRangeText(indent, source.selectionStart, source.selectionEnd, 'end');
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

const mountRunner = (root: HTMLElement): void => {
  const parts: Parts = {
    button: find(root, 'run', HTMLButtonElement),
    input: find(root, 'stdin', HTMLTextAreaElement),
    output: find(root, 'output', HTMLElement),
    root,
    source: find(root, 'source', HTMLTextAreaElement),
    status: find(root, 'status', HTMLElement),
  };
  parts.button.addEventListener('click', () => {
    void execute(parts);
  });
  parts.source.addEventListener('keydown', (event) => {
    insertIndent(event, parts.source);
  });
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
