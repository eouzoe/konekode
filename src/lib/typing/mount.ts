import { guard } from '@/lib/fault/fault';
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

const deleteKeys = new Set(['Backspace', 'Delete']);

const typedBy = (event: KeyboardEvent): string | null => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.key === 'Enter') {
    return '\n';
  }
  if (event.key.length === 1) {
    return event.key;
  }
  return null;
};

const typeInto = (drill: Drill, text: string): Drill => {
  let next = drill;
  for (const char of text) {
    next = press(next, char);
  }
  return next;
};

const judge = (drill: Drill, event: KeyboardEvent): Drill | null => {
  const typed = typedBy(event);
  if (event.key === escapeKey) {
    return escape(drill);
  }
  if (deleteKeys.has(event.key)) {
    return remind(drill, 'no-delete');
  }
  if (typed === null) {
    return null;
  }
  return press(drill, typed);
};

const onKeyDown = (drill: Drill, event: KeyboardEvent): Drill => {
  const next = judge(drill, event);
  if (next === null) {
    return drill;
  }
  event.preventDefault();
  event.stopPropagation();
  return next;
};

const isElsewhere = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('dialog, input, textarea, select') !== null;

const isOpen = (session: Session, parts: Parts): boolean =>
  !session.demo &&
  parts.input.offsetParent !== null &&
  parts.root.closest<HTMLElement>('[data-scene]')?.dataset.waiting === 'true';

const collectParts = (root: HTMLElement): Parts => ({
  current: findPart(root, 'current'),
  done: findPart(root, 'done'),
  hint: findPart(root, 'hint'),
  input: findPart(root, 'input'),
  keyboard: findPart(root, 'keyboard'),
  mode: findPart(root, 'mode'),
  rest: findPart(root, 'rest'),
  root,
});

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
  if (session.demo) {
    parts.input.removeAttribute('tabindex');
    return;
  }
  parts.input.tabIndex = 0;
};

const paint = (session: Session, parts: Parts): void => {
  render(parts, shown(session));
  parts.current.scrollIntoView({ block: 'nearest' });
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
  document.addEventListener(
    'keydown',
    (event) => {
      if (!isOpen(session, parts) || isElsewhere(event.target)) {
        return;
      }
      const next = onKeyDown(session.live, event);
      record(session, parts, attemptOf(session.live, next, event.key));
      advance(session, parts, next);
    },
    { capture: true },
  );
  parts.root.addEventListener('click', () => {
    if (!session.demo) {
      parts.input.focus();
    }
  });
  parts.root.addEventListener('drill:demo', (event) => {
    if (event instanceof CustomEvent && isScript(event.detail)) {
      guard('drill', play(session, parts, event.detail));
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
