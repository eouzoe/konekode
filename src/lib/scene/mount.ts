import { unitState } from '@/lib/progress/events';
import { clearDraft, readEvents, record } from '@/lib/progress/store';

import { applies } from './conditions';
import { readIntent } from './keys';

interface Scene {
  readonly beats: readonly HTMLElement[];
  readonly finished: Set<number>;
  index: number;
  readonly lines: readonly HTMLElement[];
  readonly note: HTMLElement | null;
  readonly root: HTMLElement;
  readonly snippet: HTMLElement | null;
  readonly stdin: HTMLTextAreaElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  readonly unit: string;
}

const forward = 1;
const backward = -forward;
const beatId = (beat: HTMLElement | undefined): string => beat?.dataset.id ?? '';

const isWaiting = (scene: Scene): boolean => {
  const wait = scene.beats[scene.index]?.dataset.wait ?? '';
  return wait !== '' && !scene.finished.has(scene.index);
};

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
    waiting: String(isWaiting(scene)),
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

const schedule = (scene: Scene, beat: HTMLElement): void => {
  if (scene.timer !== null) {
    clearTimeout(scene.timer);
    scene.timer = null;
  }
  const delay = Number(beat.dataset.auto ?? '');
  if (delay > 0) {
    scene.timer = setTimeout(() => {
      scene.root.dispatchEvent(new CustomEvent('scene:auto'));
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

const refresh = (scene: Scene, beat: HTMLElement): void => {
  direct(scene, beat);
  schedule(scene, beat);
  showStage(scene, beat);
  fillInput(scene, beat);
  setNote(scene, '');
};

const show = (scene: Scene): void => {
  const beat = scene.beats[scene.index];
  if (beat === undefined) {
    return;
  }
  for (const [at, other] of scene.beats.entries()) {
    other.hidden = !isShown(scene, at);
  }
  refresh(scene, beat);
  const typing = scene.root.querySelector<HTMLElement>('[data-role="input"]');
  if (beat.dataset.wait === 'drill' && isWaiting(scene)) {
    typing?.focus();
  } else {
    typing?.blur();
  }
};

const seek = (scene: Scene, step: number): number => {
  let next = scene.index + step;
  while (next >= 0 && next < scene.beats.length && !applies(scene.beats[next])) {
    next += step;
  }
  return next;
};

const move = (scene: Scene, step: number): void => {
  const next = seek(scene, step);
  if (next < 0 || next >= scene.beats.length) {
    return;
  }
  if (step > 0 && isWaiting(scene)) {
    return;
  }
  scene.index = next;
  record('beat.reached', scene.unit, beatId(scene.beats[next]));
  show(scene);
};

const matches = (beat: HTMLElement, output: string): boolean => {
  const { expect } = beat.dataset;
  return expect === undefined || output.trim() === expect;
};

const settle = (scene: Scene, beat: HTMLElement): void => {
  scene.finished.add(scene.index);
  record('check.passed', scene.unit, beatId(beat));
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
};

const proceed = (scene: Scene, kind: string): void => {
  if (kind === 'drill') {
    scene.root.dataset.waiting = 'false';
    return;
  }
  move(scene, forward);
};

const complete = (scene: Scene, kind: string, output: string): void => {
  const beat = scene.beats[scene.index];
  if (beat?.dataset.wait !== kind || scene.finished.has(scene.index)) {
    return;
  }
  if (!matches(beat, output)) {
    setNote(scene, '印出來的東西和要的不一樣，請再檢查一次。');
    return;
  }
  settle(scene, beat);
  proceed(scene, kind);
};

const restore = (scene: Scene): void => {
  const state = unitState(readEvents(), scene.unit);
  for (const [at, beat] of scene.beats.entries()) {
    if (state.passed.has(beatId(beat))) {
      scene.finished.add(at);
    }
  }
  const found = scene.beats.findIndex((beat) => beatId(beat) === state.position);
  scene.index = Math.max(found, 0);
  for (const beat of scene.beats.slice(0, scene.index)) {
    fillInput(scene, beat);
  }
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
    move(scene, backward);
    return;
  }
  move(scene, forward);
};

const release = (event: Event): void => {
  event.stopPropagation();
  if (event.currentTarget instanceof HTMLElement) {
    event.currentTarget.blur();
  }
};

const listenChecks = (scene: Scene): void => {
  scene.root.addEventListener('scene:auto', () => {
    move(scene, forward);
  });
  scene.root.addEventListener('scene:step', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'number') {
      move(scene, event.detail);
    }
  });
  scene.root.addEventListener('drill:played', () => {
    if (scene.beats[scene.index]?.dataset.after === 'next') {
      move(scene, forward);
    }
  });
  scene.root.addEventListener('drill:done', () => {
    complete(scene, 'drill', '');
  });
  scene.root.addEventListener('run:ok', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      complete(scene, 'run', event.detail);
    }
  });
};

const listen = (scene: Scene): void => {
  const { root } = scene;
  root.querySelector('[data-role="dialogue"]')?.addEventListener('click', () => {
    if (globalThis.getSelection()?.isCollapsed ?? true) {
      move(scene, forward);
    }
  });
  root.querySelector('[data-role="back"]')?.addEventListener('click', (event) => {
    release(event);
    move(scene, backward);
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

const mountScene = (root: HTMLElement): void => {
  const scene: Scene = {
    beats: [...root.querySelectorAll<HTMLElement>('[data-beat]')],
    finished: new Set<number>(),
    index: 0,
    lines: [...root.querySelectorAll<HTMLElement>('[data-line]')],
    note: root.querySelector<HTMLElement>('[data-role="note"]'),
    root,
    snippet: root.querySelector<HTMLElement>('[data-role="snippet"]'),
    stdin: root.querySelector<HTMLTextAreaElement>('[data-role="stdin"]'),
    timer: null,
    unit: root.dataset.unit ?? '',
  };
  restore(scene);
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
