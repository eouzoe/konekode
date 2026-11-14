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
  timer: ReturnType<typeof setTimeout> | null;
  readonly unit: string;
}

const forward = 1;
const backward = -forward;
const backwardKeys = new Set(['ArrowLeft', 'ArrowUp']);
const silentKeys = new Set(['Alt', 'CapsLock', 'Control', 'Escape', 'Meta', 'Shift', 'Tab']);

const isControl = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLInputElement ||
  target instanceof HTMLButtonElement ||
  (target instanceof HTMLElement && target.closest('.cm-editor') !== null);

const isDrillInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement && target.dataset.role === 'input';

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

const direct = (scene: Scene, beat: HTMLElement): void => {
  const { demo } = beat.dataset;
  if (demo !== undefined) {
    scene.root
      .querySelector('[data-typing-drill]')
      ?.dispatchEvent(new CustomEvent('drill:demo', { detail: demo }));
  }
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

const isIgnored = (event: KeyboardEvent): boolean => {
  if (isDrillInput(event.target)) {
    return !backwardKeys.has(event.key);
  }
  return isControl(event.target) || isShortcut(event);
};

const onKey = (scene: Scene, event: KeyboardEvent): void => {
  if (isIgnored(event)) {
    return;
  }
  event.preventDefault();
  if (backwardKeys.has(event.key)) {
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
