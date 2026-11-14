import { createDrill, escape, isDone, press, remind, type Drill } from './drill';
import { escapeKey } from './keyboard';
import { buildKeyboard, findPart, render, type Parts } from './view';

const deleteKeys = new Set(['Backspace', 'Delete']);

const readInput = (event: InputEvent): string => {
  if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') {
    return '\n';
  }
  if (event.inputType === 'insertText') {
    return event.data ?? '';
  }
  return '';
};

const typeInto = (drill: Drill, text: string): Drill => {
  let next = drill;
  for (const char of text) {
    next = press(next, char);
  }
  return next;
};

const onKeyDown = (drill: Drill, event: KeyboardEvent): Drill => {
  if (event.isComposing) {
    return drill;
  }
  if (event.key === escapeKey) {
    event.preventDefault();
    return escape(drill);
  }
  if (deleteKeys.has(event.key)) {
    event.preventDefault();
    return remind(drill, 'no-delete');
  }
  return drill;
};

const onInput = (drill: Drill, event: InputEvent): Drill => {
  event.preventDefault();
  if (event.isComposing || event.inputType === 'insertCompositionText') {
    return remind(drill, 'ime');
  }
  return typeInto(drill, readInput(event));
};

const collectParts = (root: HTMLElement): Parts => {
  const input = findPart(root, 'input');
  if (!(input instanceof HTMLTextAreaElement)) {
    throw new TypeError('輸入框必須是 textarea');
  }
  return {
    current: findPart(root, 'current'),
    done: findPart(root, 'done'),
    hint: findPart(root, 'hint'),
    input,
    keyboard: findPart(root, 'keyboard'),
    mode: findPart(root, 'mode'),
    rest: findPart(root, 'rest'),
    root,
  };
};

interface Session {
  demo: boolean;
  drill: Drill;
  token: number;
}

type Step = (session: Session, parts: Parts, value: string) => void;

const stepDelay = 450;
const flashFrames = [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }];
const flashTiming = { duration: 380, iterations: 2 };

const setDown = (parts: Parts, key: string, down: boolean): void => {
  for (const element of parts.keyboard.querySelectorAll<HTMLElement>('.key')) {
    if (element.dataset.key === key) {
      element.dataset.down = String(down);
    }
  }
};

const steps: Record<string, Step> = {
  demo: (session) => {
    session.demo = true;
  },
  down: (_session, parts, value) => {
    setDown(parts, value, true);
  },
  esc: (session) => {
    session.drill = escape(session.drill);
  },
  flash: (_session, parts) => {
    parts.mode.animate(flashFrames, flashTiming);
  },
  key: (session, _parts, value) => {
    session.drill = press(session.drill, value);
  },
  live: (session) => {
    session.demo = false;
  },
  reset: (session, parts) => {
    session.drill = createDrill(session.drill.target);
    for (const element of parts.keyboard.querySelectorAll<HTMLElement>('.key')) {
      element.dataset.down = 'false';
    }
  },
  up: (_session, parts, value) => {
    setDown(parts, value, false);
  },
};

const pause = async (): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, stepDelay);
  await promise;
};

interface Run {
  readonly mine: number;
  readonly parts: Parts;
  readonly session: Session;
}

const playFrom = async (run: Run, queue: readonly string[]): Promise<void> => {
  const [step, ...rest] = queue;
  if (step === undefined || run.session.token !== run.mine) {
    return;
  }
  const [name = '', value = ''] = step.split(':');
  steps[name]?.(run.session, run.parts, value);
  render(run.parts, run.session.drill);
  await pause();
  await playFrom(run, rest);
};

const play = async (session: Session, parts: Parts, script: string): Promise<void> => {
  session.token += 1;
  await playFrom({ mine: session.token, parts, session }, script.split(' '));
};

const advance = (session: Session, parts: Parts, next: Drill): void => {
  if (session.demo) {
    return;
  }
  const wasDone = isDone(session.drill);
  session.drill = next;
  render(parts, session.drill);
  if (!wasDone && isDone(session.drill)) {
    parts.root.dispatchEvent(new CustomEvent('drill:done', { bubbles: true }));
  }
};

const listen = (session: Session, parts: Parts): void => {
  parts.input.addEventListener('beforeinput', (event) => {
    advance(session, parts, onInput(session.drill, event));
  });
  parts.input.addEventListener('keydown', (event) => {
    advance(session, parts, onKeyDown(session.drill, event));
  });
  parts.input.addEventListener('compositionend', () => {
    parts.input.value = '';
  });
  parts.root.addEventListener('click', () => {
    parts.input.focus();
  });
  parts.root.addEventListener('drill:demo', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      void play(session, parts, event.detail);
    }
  });
};

const mountDrill = (root: HTMLElement): void => {
  const parts = collectParts(root);
  const session: Session = {
    demo: false,
    drill: createDrill(root.dataset.target ?? ''),
    token: 0,
  };
  buildKeyboard(parts.keyboard);
  render(parts, session.drill);
  listen(session, parts);
};

const mountAll = (): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-typing-drill]')) {
    mountDrill(root);
  }
};

export { mountAll };
