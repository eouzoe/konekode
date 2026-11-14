import { object, optional, safeParse, string, type InferOutput } from 'valibot';

import { watchFullScreen } from './conditions';
import { readIntent, type Intent } from './keys';
import { type Check } from './machine';

interface Handlers {
  readonly back: () => void;
  readonly checked: (kind: Check, output: string, beat: string) => void;
  readonly next: () => void;
  readonly played: (beat: string) => void;
  readonly resized: () => void;
  readonly restart: () => void;
  readonly screen: () => void;
}

const reportSchema = object({ beat: string(), output: optional(string(), '') });

const readReport = (event: Event): InferOutput<typeof reportSchema> | null => {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  const parsed = safeParse(reportSchema, event.detail);
  if (!parsed.success) {
    return null;
  }
  return parsed.output;
};

const runProgram = (root: HTMLElement): boolean => {
  const runner = root.querySelector<HTMLElement>('[data-code-runner]');
  if (runner?.dataset.armed !== 'true') {
    return false;
  }
  runner.dispatchEvent(new CustomEvent('runner:run'));
  return true;
};

const turn = (handlers: Handlers, intent: Intent): void => {
  if (intent === 'backward') {
    handlers.back();
    return;
  }
  handlers.next();
};

const onKey = (root: HTMLElement, handlers: Handlers, event: KeyboardEvent): void => {
  const intent = readIntent(event);
  if (intent === 'none') {
    return;
  }
  event.preventDefault();
  if (event.key === 'Enter' && runProgram(root)) {
    return;
  }
  turn(handlers, intent);
};

const release = (event: Event): void => {
  event.stopPropagation();
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.blur();
  }
};

const listenChecks = (root: HTMLElement, handlers: Handlers): void => {
  root.addEventListener('scene:step', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'number') {
      if (event.detail > 0) {
        handlers.next();
      } else {
        handlers.back();
      }
    }
  });
  root.addEventListener('drill:played', (event) => {
    const report = readReport(event);
    if (report !== null) {
      handlers.played(report.beat);
    }
  });
  root.addEventListener('drill:done', (event) => {
    const report = readReport(event);
    if (report !== null) {
      handlers.checked('drill', '', report.beat);
    }
  });
  root.addEventListener('run:ok', (event) => {
    const report = readReport(event);
    if (report !== null) {
      handlers.checked('run', report.output, report.beat);
    }
  });
};

const listenButtons = (root: HTMLElement, handlers: Handlers): void => {
  root.querySelector('[data-role="dialogue"]')?.addEventListener('click', () => {
    if (globalThis.getSelection()?.isCollapsed ?? true) {
      handlers.next();
    }
  });
  root.querySelector('[data-role="back"]')?.addEventListener('click', (event) => {
    release(event);
    handlers.back();
  });
  root.querySelector('[data-role="restart"]')?.addEventListener('click', (event) => {
    release(event);
    handlers.restart();
  });
};

const listenInput = (root: HTMLElement, handlers: Handlers): void => {
  listenButtons(root, handlers);
  listenChecks(root, handlers);
  document.addEventListener('keydown', (event) => {
    onKey(root, handlers, event);
  });
  globalThis.addEventListener('resize', handlers.resized);
  watchFullScreen(handlers.screen);
};

export { listenInput };
