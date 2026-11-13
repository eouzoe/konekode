import { unitState } from '@/lib/progress/events';
import { clearDraft, readEvents, record } from '@/lib/progress/store';

interface Scene {
  readonly beats: readonly HTMLElement[];
  readonly finished: Set<number>;
  index: number;
  readonly lines: readonly HTMLElement[];
  readonly note: HTMLElement | null;
  readonly root: HTMLElement;
  readonly snippet: HTMLElement | null;
  readonly stdin: HTMLTextAreaElement | null;
  readonly unit: string;
}

const forward = 1;
const backward = -forward;
const backwardKeys = new Set(['ArrowLeft']);
const silentKeys = new Set(['Alt', 'CapsLock', 'Control', 'Escape', 'Meta', 'Shift', 'Tab']);

const isControl = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLInputElement ||
  target instanceof HTMLButtonElement;

const isShortcut = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey || silentKeys.has(event.key);

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

const show = (scene: Scene): void => {
  const beat = scene.beats[scene.index];
  if (beat === undefined) {
    return;
  }
  for (const [at, other] of scene.beats.entries()) {
    other.hidden = at !== scene.index;
  }
  showStage(scene, beat);
  fillInput(scene, beat);
  setNote(scene, '');
  if (beat.dataset.wait === 'drill' && isWaiting(scene)) {
    scene.root.querySelector<HTMLElement>('[data-role="input"]')?.focus();
  }
};

const move = (scene: Scene, step: number): void => {
  const next = scene.index + step;
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

const complete = (scene: Scene, kind: string, output: string): void => {
  const beat = scene.beats[scene.index];
  if (beat?.dataset.wait !== kind || scene.finished.has(scene.index)) {
    return;
  }
  const { expect } = beat.dataset;
  if (expect !== undefined && output.trim() !== expect) {
    setNote(scene, '印出來的東西和要的不一樣，請再檢查一次。');
    return;
  }
  scene.finished.add(scene.index);
  record('check.passed', scene.unit, beatId(beat));
  move(scene, forward);
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
  if (isControl(event.target) || isShortcut(event)) {
    return;
  }
  event.preventDefault();
  if (backwardKeys.has(event.key)) {
    move(scene, backward);
    return;
  }
  move(scene, forward);
};

const listenChecks = (scene: Scene): void => {
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
    move(scene, forward);
  });
  root.querySelector('[data-role="back"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
    move(scene, backward);
  });
  root.querySelector('[data-role="restart"]')?.addEventListener('click', (event) => {
    event.stopPropagation();
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
