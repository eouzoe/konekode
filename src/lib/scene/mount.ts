interface Scene {
  readonly beats: readonly HTMLElement[];
  readonly finished: Set<string>;
  index: number;
  readonly lines: readonly HTMLElement[];
  readonly root: HTMLElement;
}

const forward = 1;
const backward = -forward;
const forwardKeys = new Set(['ArrowRight', 'Enter', ' ']);
const backwardKeys = new Set(['ArrowLeft']);

const isTyping = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement;

const isWaiting = (scene: Scene): boolean => {
  const wait = scene.beats[scene.index]?.dataset.wait ?? '';
  return wait !== '' && !scene.finished.has(wait);
};

const markLines = (scene: Scene, beat: HTMLElement): void => {
  const marked = new Set((beat.dataset.lines ?? '').split(','));
  for (const line of scene.lines) {
    line.dataset.marked = String(marked.has(line.dataset.line ?? ''));
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
  markLines(scene, beat);
  Object.assign(scene.root.dataset, {
    last: String(scene.index === scene.beats.length - forward),
    stage: beat.dataset.stage ?? 'empty',
    waiting: String(isWaiting(scene)),
  });
  if (isWaiting(scene)) {
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
    scene.finished.add('drill');
    move(scene, forward);
  });
};

const mountScene = (root: HTMLElement): void => {
  const scene: Scene = {
    beats: [...root.querySelectorAll<HTMLElement>('[data-beat]')],
    finished: new Set<string>(),
    index: 0,
    lines: [...root.querySelectorAll<HTMLElement>('[data-line]')],
    root,
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
