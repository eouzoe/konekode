interface Scene {
  readonly beats: readonly HTMLElement[];
  readonly finished: Set<number>;
  index: number;
  readonly lines: readonly HTMLElement[];
  readonly note: HTMLElement | null;
  readonly root: HTMLElement;
  readonly snippet: HTMLElement | null;
  readonly stdin: HTMLTextAreaElement | null;
}

const forward = 1;
const backward = -forward;
const forwardKeys = new Set(['ArrowRight', 'Enter', ' ']);
const backwardKeys = new Set(['ArrowLeft']);

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;

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
  show(scene);
};

const complete = (scene: Scene, kind: string, output: string): void => {
  const beat = scene.beats[scene.index];
  if (beat?.dataset.wait !== kind) {
    return;
  }
  const { expect } = beat.dataset;
  if (expect !== undefined && output.trim() !== expect) {
    setNote(scene, '印出來的東西和要的不一樣，請再檢查一次。');
    return;
  }
  scene.finished.add(scene.index);
  move(scene, forward);
};

const onKey = (scene: Scene, event: KeyboardEvent): void => {
  if (isTyping(event.target)) {
    return;
  }
  if (forwardKeys.has(event.key)) {
    event.preventDefault();
    move(scene, forward);
  }
  if (backwardKeys.has(event.key)) {
    event.preventDefault();
    move(scene, backward);
  }
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
  document.addEventListener('keydown', (event) => {
    onKey(scene, event);
  });
  root.addEventListener('drill:done', () => {
    complete(scene, 'drill', '');
  });
  root.addEventListener('run:ok', (event) => {
    if (event instanceof CustomEvent && typeof event.detail === 'string') {
      complete(scene, 'run', event.detail);
    }
  });
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
  };
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
