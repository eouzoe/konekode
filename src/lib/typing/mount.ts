import { noteAttempt, noteEntry } from '@/lib/run/note';

import {
  createDrill,
  escape,
  expectedChar,
  isDone,
  isTyped,
  press,
  remind,
  type Drill,
} from './drill';
import { escapeKey } from './keyboard';
import { attemptOf } from './note';
import {
  instant,
  labels,
  nextChunk,
  setDown,
  stepDelay,
  steps,
  type Script,
  type Session,
} from './steps';
import { buildKeyboard, findPart, quiet, render, type Parts } from './view';
import { isFullWidth } from './width';

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
  if (isFullWidth(event.data ?? '')) {
    return remind(drill, 'full-width');
  }
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

const shown = (session: Session): Drill => {
  if (session.demo) {
    return session.show;
  }
  return session.live;
};

const yieldInput = (session: Session, parts: Parts): void => {
  if (session.demo && document.activeElement === parts.input) {
    parts.input.blur();
  }
  parts.input.disabled = session.demo;
};

const paint = (session: Session, parts: Parts): void => {
  render(parts, shown(session));
  yieldInput(session, parts);
  parts.root.dataset.demo = String(session.demo);
  if (session.demo && (!session.guide || isDone(session.show))) {
    quiet(parts);
  }
  const label = labels[session.pretend];
  if (label !== undefined) {
    parts.mode.textContent = label;
  }
};

const fillAll = (drill: Drill): Drill => {
  let next = drill;
  while (!isTyped(next)) {
    next = press(next, expectedChar(next));
  }
  return next;
};

const runStep = (session: Session, parts: Parts, step: string): void => {
  const [name = '', value = ''] = step.split(':');
  if (name !== 'show') {
    session.pretend = '';
  }
  if (name === 'fill') {
    session.show = fillAll(session.show);
    return;
  }
  steps[name]?.(session, parts, value);
};

const pause = async (delay: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, delay);
  await promise;
};

interface Run {
  readonly mine: number;
  readonly parts: Parts;
  readonly session: Session;
}

const isCurrent = (run: Run): boolean => run.session.token === run.mine;

const fillSlowly = async (run: Run): Promise<void> => {
  const { session } = run;
  if (!isCurrent(run) || isTyped(session.show)) {
    return;
  }
  const chunk = nextChunk(session.show);
  session.show = typeInto(session.show, chunk.text);
  paint(session, run.parts);
  await pause(chunk.pause);
  await fillSlowly(run);
};

const playStep = async (run: Run, step: string): Promise<void> => {
  if (step === 'fill') {
    await fillSlowly(run);
    return;
  }
  runStep(run.session, run.parts, step);
  paint(run.session, run.parts);
  if (!instant.has(step)) {
    await pause(stepDelay);
  }
};

const playFrom = async (run: Run, queue: readonly string[]): Promise<void> => {
  const [step, ...rest] = queue;
  if (step === undefined || !isCurrent(run)) {
    return;
  }
  await playStep(run, step);
  await playFrom(run, rest);
};

const placeOf = (session: Session, parts: Parts): { beat: string; unit: string } => ({
  beat: session.beat,
  unit: parts.root.closest<HTMLElement>('[data-unit]')?.dataset.unit ?? '',
});

const finishPlay = (session: Session, parts: Parts): void => {
  const options = { bubbles: true, detail: { beat: session.beat } };
  parts.root.dispatchEvent(new CustomEvent('drill:played', options));
  if (!session.demo) {
    noteEntry(placeOf(session, parts), 'guided', '');
  }
};

const record = (session: Session, parts: Parts, attempt: ReturnType<typeof attemptOf>): void => {
  if (!session.demo && attempt !== null) {
    noteAttempt(placeOf(session, parts), attempt);
  }
};

const words = (script: string): string[] => script.split(' ').filter((word) => word !== '');

const play = async (session: Session, parts: Parts, script: Script): Promise<void> => {
  Object.assign(session, { beat: script.beat, token: session.token + 1 });
  const run: Run = { mine: session.token, parts, session };
  for (const step of words(script.before)) {
    runStep(session, parts, step);
  }
  setDown(parts, '', false);
  paint(session, parts);
  await playFrom(run, words(script.now));
  if (isCurrent(run)) {
    finishPlay(session, parts);
  }
};

const isScript = (value: unknown): value is Script =>
  typeof value === 'object' &&
  value !== null &&
  'beat' in value &&
  'before' in value &&
  'now' in value &&
  typeof value.beat === 'string' &&
  typeof value.before === 'string' &&
  typeof value.now === 'string';

const advance = (session: Session, parts: Parts, next: Drill): void => {
  if (session.demo) {
    return;
  }
  const wasDone = isDone(session.live);
  session.live = next;
  paint(session, parts);
  if (!wasDone && isDone(session.live)) {
    const detail = { beat: session.beat };
    parts.root.dispatchEvent(new CustomEvent('drill:done', { bubbles: true, detail }));
  }
};

const listen = (session: Session, parts: Parts): void => {
  parts.input.addEventListener('beforeinput', (event) => {
    const next = onInput(session.live, event);
    record(session, parts, attemptOf(session.live, next, event.data ?? event.inputType));
    advance(session, parts, next);
  });
  parts.input.addEventListener('keydown', (event) => {
    const next = onKeyDown(session.live, event);
    record(session, parts, attemptOf(session.live, next, event.key));
    advance(session, parts, next);
  });
  parts.input.addEventListener('compositionend', () => {
    parts.input.value = '';
  });
  parts.root.addEventListener('click', () => {
    if (!session.demo) {
      parts.input.focus();
    }
  });
  parts.root.addEventListener('drill:demo', (event) => {
    if (event instanceof CustomEvent && isScript(event.detail)) {
      void play(session, parts, event.detail);
    }
  });
};

const mountDrill = (root: HTMLElement): void => {
  const parts = collectParts(root);
  const fresh = createDrill(root.dataset.target ?? '');
  const session: Session = {
    beat: '',
    demo: false,
    guide: false,
    live: fresh,
    pretend: '',
    show: fresh,
    token: 0,
  };
  buildKeyboard(parts.keyboard);
  paint(session, parts);
  listen(session, parts);
};

const mountAll = (): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-typing-drill]')) {
    mountDrill(root);
  }
};

export { mountAll };
