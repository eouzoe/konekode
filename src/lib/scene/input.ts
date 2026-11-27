import { Effect, Option, Schema } from 'effect';

import { watchFullScreen } from './conditions';
import { readIntent, wouldLeave, type Intent } from './keys';

import type { Check } from './machine';

interface Handlers {
  readonly back: () => void;
  readonly checked: (kind: Check, output: string, beat: string) => void;
  readonly next: () => void;
  readonly played: (beat: string) => void;
  readonly restart: () => void;
  readonly screen: () => void;
}

const reportSchema = Schema.Struct({
  beat: Schema.String,
  output: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(''))),
});
const decodeReport = Schema.decodeUnknownOption(reportSchema);

const readReport = (event: Event): typeof reportSchema.Type | null => {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  return Option.getOrNull(decodeReport(event.detail));
};

const runProgram = (root: HTMLElement): boolean => {
  const runner = root.querySelector<HTMLElement>('[data-code-runner]');
  if (runner?.dataset.armed !== 'true') {
    return false;
  }
  runner.dispatchEvent(new CustomEvent('runner:run'));
  return true;
};

const gateInputs = [
  '[data-typing-drill][data-demo="false"] [data-role="input"]',
  '[data-code-runner][data-armed="true"] [data-role="editor"]',
].join(', ');
const tabKey = 'Tab';

const refocus = (root: HTMLElement): boolean => {
  if (root.dataset.waiting !== 'true') {
    return false;
  }
  const inputs = [...root.querySelectorAll<HTMLElement>(gateInputs)];
  const target = inputs.find((input) => input.offsetParent !== null);
  target?.focus();
  return target !== undefined;
};

const turn = (root: HTMLElement, handlers: Handlers, intent: Intent): void => {
  if (intent === 'backward') {
    handlers.back();
    return;
  }
  if (!refocus(root)) {
    handlers.next();
  }
};

const inDialog = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('dialog') !== null;

const keepInGate = (root: HTMLElement, event: KeyboardEvent): boolean => {
  if (event.key !== tabKey || inDialog(event.target) || !refocus(root)) {
    return false;
  }
  event.preventDefault();
  return true;
};

const keepOnPage = (event: KeyboardEvent): boolean => {
  if (!wouldLeave(event)) {
    return false;
  }
  event.preventDefault();
  return true;
};

const onKey = (root: HTMLElement, handlers: Handlers, event: KeyboardEvent): void => {
  const intent = readIntent(event);
  if (keepOnPage(event) || keepInGate(root, event) || intent === 'none') {
    return;
  }
  event.preventDefault();
  if (event.key === 'Enter' && runProgram(root)) {
    return;
  }
  turn(root, handlers, intent);
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

const listenButtons = (
  root: HTMLElement,
  handlers: Pick<Handlers, 'back' | 'next' | 'restart'>,
): void => {
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
  watchFullScreen(handlers.screen);
};

export { listenButtons, listenInput };
