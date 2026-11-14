import { createActor, type Actor, type SnapshotFrom } from 'xstate';

import { unitState } from '@/lib/progress/events';
import { clearDraft, readEvents, record } from '@/lib/progress/store';

import { isFullScreen } from './conditions';
import { readIntent } from './keys';
import { sceneMachine, type Check } from './machine';
import { readMeta } from './meta';

type Move = 'AUTO' | 'BACK' | 'NEXT' | 'PLAYED';

interface Scene {
  readonly actor: Actor<typeof sceneMachine>;
  readonly beats: readonly HTMLElement[];
  index: number;
  readonly lines: readonly HTMLElement[];
  readonly note: HTMLElement | null;
  passed: number;
  readonly root: HTMLElement;
  readonly snippet: HTMLElement | null;
  readonly stdin: HTMLTextAreaElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  readonly unit: string;
  waiting: boolean;
}

const forward = 1;
const mismatchNote = '印出來的東西和要的不一樣，請再檢查一次。';
const markLines = (scene: Scene, beat: HTMLElement): void => {
  const marked = new Set((beat.dataset.lines ?? '').split(','));
  for (const line of scene.lines) {
    line.dataset.marked = String(marked.has(line.dataset.line ?? ''));
  }
};

const showStage = (scene: Scene, beat: HTMLElement): void => {
  markLines(scene, beat);
  if (scene.snippet !== null) {
    scene.snippet.textContent = beat.dataset.snippet ?? '';
  }
  Object.assign(scene.root.dataset, {
    last: String(scene.index === scene.beats.length - forward),
    stage: beat.dataset.stage ?? 'empty',
    waiting: String(scene.waiting),
  });
};

const fillInput = (scene: Scene, beat: HTMLElement): void => {
  const { input } = beat.dataset;
  if (scene.stdin === null || input === undefined) {
    return;
  }
  scene.stdin.value = input;
  const field = scene.stdin.closest('label');
  if (field !== null) {
    field.hidden = false;
  }
};

const setNote = (scene: Scene, text: string): void => {
  if (scene.note !== null) {
    scene.note.textContent = text;
  }
};

const isShown = (scene: Scene, at: number): boolean => {
  if (at > scene.index) {
    return false;
  }
  return scene.beats
    .slice(at + forward, scene.index + forward)
    .every((beat) => beat.dataset.append === 'true');
};

const step = (scene: Scene, type: Move): void => {
  scene.actor.send({ full: isFullScreen(), type });
};

const schedule = (scene: Scene, beat: HTMLElement): void => {
  if (scene.timer !== null) {
    clearTimeout(scene.timer);
    scene.timer = null;
  }
  const delay = Number(beat.dataset.auto ?? '');
  if (delay > 0) {
    scene.timer = setTimeout(() => {
      step(scene, 'AUTO');
    }, delay);
  }
};

const demoStart = (scene: Scene): number =>
  scene.beats.findLastIndex(
    (beat, at) => at <= scene.index && (beat.dataset.demo ?? '').startsWith('reset'),
  );

const direct = (scene: Scene, beat: HTMLElement): void => {
  const start = demoStart(scene);
  if (start < 0 || beat.dataset.stage !== 'drill') {
    return;
  }
  const before = scene.beats
    .slice(start, scene.index)
    .map((earlier) => earlier.dataset.demo ?? '')
    .join(' ');
  const detail = { before, now: beat.dataset.demo ?? '' };
  scene.root
    .querySelector('[data-typing-drill]')
    ?.dispatchEvent(new CustomEvent('drill:demo', { detail }));
};

const focusTyping = (scene: Scene, beat: HTMLElement): void => {
  const typing = scene.root.querySelector<HTMLElement>('[data-role="input"]');
  if (beat.dataset.wait === 'drill' && scene.waiting) {
    typing?.focus();
  } else {
    typing?.blur();
  }
};

const show = (scene: Scene): void => {
  const beat = scene.beats[scene.index];
  if (beat === undefined) {
    return;
  }
  for (const [at, other] of scene.beats.entries()) {
    other.hidden = !isShown(scene, at);
  }
  direct(scene, beat);
  schedule(scene, beat);
  showStage(scene, beat);
  fillInput(scene, beat);
  focusTyping(scene, beat);
};

const notePassed = (scene: Scene, passed: readonly string[]): void => {
  for (const id of passed.slice(scene.passed)) {
    record('check.passed', scene.unit, id);
  }
  if (passed.length > scene.passed && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  scene.passed = passed.length;
};

const enter = (scene: Scene, index: number): void => {
  if (index === scene.index) {
    scene.root.dataset.waiting = String(scene.waiting);
    return;
  }
  scene.index = index;
  record('beat.reached', scene.unit, scene.beats[index]?.dataset.id ?? '');
  show(scene);
};

const sync = (scene: Scene, snapshot: SnapshotFrom<typeof sceneMachine>): void => {
  const { index, mismatch, passed } = snapshot.context;
  notePassed(scene, passed);
  scene.waiting = snapshot.matches('blocked');
  enter(scene, index);
  if (mismatch) {
    setNote(scene, mismatchNote);
    return;
  }
  setNote(scene, '');
};

const check = (scene: Scene, kind: Check, output: string): void => {
  scene.actor.send({ full: isFullScreen(), kind, output, type: 'CHECKED' });
};

const restart = (scene: Scene): void => {
  record('unit.restarted', scene.unit, '');
  clearDraft(scene.unit);
  globalThis.location.reload();
};

const onKey = (scene: Scene, event: KeyboardEvent): void => {
  const intent = readIntent(event);
  if (intent === 'none') {
    return;
  }
  event.preventDefault();
  if (intent === 'backward') {
    step(scene, 'BACK');
    return;
  }
  step(scene, 'NEXT');
};

const release = (event: Event): void => {
  event.stopPropagation();
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.blur();
  }
};

const listenChecks = (scene: Scene): void => {
  scene.root.addEventListener('scene:step', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'number') {
      if (event.detail > 0) {
        step(scene, 'NEXT');
      } else {
        step(scene, 'BACK');
      }
    }
  });
  scene.root.addEventListener('drill:played', () => {
    step(scene, 'PLAYED');
  });
  scene.root.addEventListener('drill:done', () => {
    check(scene, 'drill', '');
  });
  scene.root.addEventListener('run:ok', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      check(scene, 'run', event.detail);
    }
  });
};

const listen = (scene: Scene): void => {
  const { root } = scene;
  root.querySelector('[data-role="dialogue"]')?.addEventListener('click', () => {
    if (globalThis.getSelection()?.isCollapsed ?? true) {
      step(scene, 'NEXT');
    }
  });
  root.querySelector('[data-role="back"]')?.addEventListener('click', (event) => {
    release(event);
    step(scene, 'BACK');
  });
  root.querySelector('[data-role="restart"]')?.addEventListener('click', (event) => {
    release(event);
    restart(scene);
  });
  document.addEventListener('keydown', (event) => {
    onKey(scene, event);
  });
  listenChecks(scene);
};

const build = (root: HTMLElement): Scene => {
  const beats = [...root.querySelectorAll<HTMLElement>('[data-beat]')];
  const unit = root.dataset.unit ?? '';
  const state = unitState(readEvents(), unit);
  const metas = beats.map((beat) => readMeta(beat));
  const actor = createActor(sceneMachine, {
    input: { beats: metas, passed: [...state.passed], position: state.position },
  });
  actor.start();
  const first = actor.getSnapshot();
  return {
    actor,
    beats,
    index: first.context.index,
    lines: [...root.querySelectorAll<HTMLElement>('[data-line]')],
    note: root.querySelector<HTMLElement>('[data-role="note"]'),
    passed: first.context.passed.length,
    root,
    snippet: root.querySelector<HTMLElement>('[data-role="snippet"]'),
    stdin: root.querySelector<HTMLTextAreaElement>('[data-role="stdin"]'),
    timer: null,
    unit,
    waiting: first.matches('blocked'),
  };
};

const mountScene = (root: HTMLElement): void => {
  const scene = build(root);
  for (const beat of scene.beats.slice(0, scene.index)) {
    fillInput(scene, beat);
  }
  scene.actor.subscribe((snapshot) => {
    sync(scene, snapshot);
  });
  listen(scene);
  root.dataset.ready = 'true';
  show(scene);
};

const mountScenes = (): void => {
  for (const root of document.querySelectorAll<HTMLElement>('[data-scene]')) {
    mountScene(root);
  }
};

export { mountScenes };
