import { createActor, type Actor, type SnapshotFrom } from 'xstate';

import { diagnose } from '@/lib/run/diagnose';

import { isFullScreen } from './conditions';
import { direct, stageRun } from './demo';
import { listenInput } from './input';
import { sceneMachine, type Check } from './machine';
import { grantUnlocks, readMeta } from './meta';
import { createReveal, type Reveal } from './reveal';
import { noteCheck, noteReached, openSession, restartUnit, type ReadUnit } from './session';

type Move = 'AUTO' | 'BACK' | 'NEXT' | 'PLAYED' | 'SCREEN';

interface Scene {
  readonly actor: Actor<typeof sceneMachine>;
  readonly beats: readonly HTMLElement[];
  readonly expect: HTMLElement | null;
  index: number;
  readonly lines: readonly HTMLElement[];
  readonly note: HTMLElement | null;
  passed: number;
  readonly reveal: Reveal;
  readonly root: HTMLElement;
  readonly snippet: HTMLElement | null;
  readonly stdin: HTMLElement | null;
  timer: ReturnType<typeof setTimeout> | null;
  readonly unit: string;
  waiting: boolean;
}

const forward = 1;
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
  scene.stdin.textContent = input;
  const field = scene.stdin.closest<HTMLElement>('[data-role="field"]');
  if (field !== null) {
    field.hidden = false;
  }
};

const fillExpect = (scene: Scene, beat: HTMLElement): void => {
  const field = scene.expect?.closest<HTMLElement>('[data-role="expect-field"]');
  if (scene.expect === null || field === null || field === undefined) {
    return;
  }
  scene.expect.textContent = beat.dataset.expect ?? '';
  field.hidden = beat.dataset.expect === undefined;
};

const fillBoxes = (scene: Scene, beat: HTMLElement): void => {
  fillInput(scene, beat);
  fillExpect(scene, beat);
};

const mismatchNote = (scene: Scene): string =>
  diagnose(
    scene.beats[scene.index]?.dataset.expect ?? '',
    scene.root.querySelector('[data-role="output"]')?.textContent ?? '',
  );

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

const focusTyping = (scene: Scene, beat: HTMLElement): void => {
  grantUnlocks(scene.unit, beat);
  const typing = scene.root.querySelector<HTMLElement>('[data-role="input"]');
  if (beat.dataset.wait === 'drill' && scene.waiting) {
    typing?.focus();
  } else {
    typing?.blur();
  }
  stageRun(scene.root, scene.beats, beat.dataset.wait === 'run' && scene.waiting);
};

const show = (scene: Scene): void => {
  const beat = scene.beats[scene.index];
  if (beat === undefined) {
    return;
  }
  for (const [at, other] of scene.beats.entries()) {
    other.hidden = !isShown(scene, at);
  }
  direct(scene.root, scene.beats, scene.index);
  schedule(scene, beat);
  showStage(scene, beat);
  fillBoxes(scene, beat);
  focusTyping(scene, beat);
};

const notePassed = (scene: Scene, passed: readonly string[]): void => {
  for (const id of passed.slice(scene.passed)) {
    noteCheck(scene.unit, id);
  }
  if (passed.length > scene.passed && document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  scene.passed = passed.length;
};

const enter = (scene: Scene, index: number): boolean => {
  const beat = scene.beats[index];
  if (index === scene.index) {
    scene.root.dataset.waiting = String(scene.waiting);
    if (beat !== undefined && scene.waiting) {
      focusTyping(scene, beat);
    }
    return false;
  }
  scene.index = index;
  noteReached(scene.unit, scene.beats[index]?.dataset.id ?? '');
  show(scene);
  return true;
};

const startReveal = (scene: Scene): void => {
  const beat = scene.beats[scene.index];
  scene.root.dataset.revealing = 'true';
  if (beat !== undefined) {
    scene.reveal.start(beat, () => {
      scene.actor.send({ type: 'REVEALED' });
    });
  }
};

const speak = (scene: Scene, revealing: boolean, moved: boolean): void => {
  if (!revealing) {
    scene.root.dataset.revealing = 'false';
    scene.reveal.finish();
    return;
  }
  if (moved) {
    startReveal(scene);
  }
};

const sync = (scene: Scene, snapshot: SnapshotFrom<typeof sceneMachine>): void => {
  const { index, mismatch, passed } = snapshot.context;
  notePassed(scene, passed);
  scene.waiting = snapshot.matches('blocked');
  speak(scene, snapshot.matches('revealing'), enter(scene, index));
  if (mismatch) {
    setNote(scene, mismatchNote(scene));
    return;
  }
  setNote(scene, '');
};

const check = (scene: Scene, kind: Check, output: string): void => {
  scene.actor.send({ full: isFullScreen(), kind, output, type: 'CHECKED' });
};

const isCurrent = (scene: Scene, beat: string): boolean =>
  scene.beats[scene.index]?.dataset.id === beat;

const listen = (scene: Scene): void => {
  scene.root.addEventListener('run:begin', () => {
    setNote(scene, '');
  });
  listenInput(scene.root, {
    back: () => {
      step(scene, 'BACK');
    },
    checked: (kind, output, beat) => {
      if (isCurrent(scene, beat)) {
        check(scene, kind, output);
      }
    },
    next: () => {
      step(scene, 'NEXT');
    },
    played: (beat) => {
      if (isCurrent(scene, beat)) {
        step(scene, 'PLAYED');
      }
    },
    restart: () => {
      void restartUnit(scene.unit);
    },
    screen: () => {
      step(scene, 'SCREEN');
    },
  });
};

const build = (root: HTMLElement, read: ReadUnit): Scene => {
  const beats = [...root.querySelectorAll<HTMLElement>('[data-beat]')];
  const unit = root.dataset.unit ?? '';
  const state = read(unit);
  const metas = beats.map((beat) => readMeta(beat));
  const actor = createActor(sceneMachine, {
    input: { beats: metas, passed: [...state.passed], position: state.position },
  });
  actor.start();
  const first = actor.getSnapshot();
  return {
    actor,
    beats,
    expect: root.querySelector<HTMLElement>('[data-role="expect"]'),
    index: first.context.index,
    lines: [...root.querySelectorAll<HTMLElement>('[data-line]')],
    note: root.querySelector<HTMLElement>('[data-role="note"]'),
    passed: first.context.passed.length,
    reveal: createReveal(),
    root,
    snippet: root.querySelector<HTMLElement>('[data-role="snippet"]'),
    stdin: root.querySelector<HTMLElement>('[data-role="stdin"]'),
    timer: null,
    unit,
    waiting: first.matches('blocked'),
  };
};

const mountScene = (root: HTMLElement, read: ReadUnit): void => {
  const scene = build(root, read);
  for (const beat of scene.beats.slice(0, scene.index)) {
    fillInput(scene, beat);
    grantUnlocks(scene.unit, beat);
  }
  scene.actor.subscribe((snapshot) => {
    sync(scene, snapshot);
  });
  listen(scene);
  root.dataset.ready = 'true';
  show(scene);
  startReveal(scene);
};

const mountScenes = async (): Promise<void> => {
  const read = await openSession();
  for (const root of document.querySelectorAll<HTMLElement>('[data-scene]')) {
    mountScene(root, read);
  }
};

export { mountScenes };
