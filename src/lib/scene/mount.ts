import { createActor, type Actor, type SnapshotFrom } from 'xstate';

import { type UnitState } from '@/lib/learner/engine';
import { type Supply } from '@/lib/supply/supply';

import { isFullScreen } from './conditions';
import { direct, stageRun } from './demo';
import { type Early } from './early';
import { fillExpect, fillInput, markLines, mismatchNote, showBeats } from './fill';
import { listenInput } from './input';
import { sceneMachine, type Check } from './machine';
import { grantUnlocks, readMeta } from './meta';
import { createReveal, type Reveal } from './reveal';
import { noteCheck, noteReached, restart, type ReadUnit } from './session';
import { supplyScene } from './supplies';

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
  readonly supply: Supply;
  timer: ReturnType<typeof setTimeout> | null;
  readonly unit: string;
  waiting: boolean;
}

const forward = 1;

const showStage = (scene: Scene, beat: HTMLElement): void => {
  markLines(scene.lines, beat);
  if (scene.snippet !== null) {
    scene.snippet.textContent = beat.dataset.snippet ?? '';
  }
  Object.assign(scene.root.dataset, {
    last: String(scene.index === scene.beats.length - forward),
    stage: beat.dataset.stage ?? 'empty',
    waiting: String(scene.waiting),
  });
};

const fillBoxes = (scene: Scene, beat: HTMLElement): void => {
  fillInput(scene.stdin, beat);
  fillExpect(scene.expect, beat);
};

const setNote = (scene: Scene, text: string): void => {
  if (scene.note !== null) {
    scene.note.textContent = text;
  }
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

const supplied = (scene: Scene): boolean => {
  const missing = scene.supply.missing(scene.index);
  scene.root.dataset.supplying = String(missing.length > 0);
  return missing.length === 0;
};

const focusTyping = (scene: Scene, beat: HTMLElement): void => {
  const typing = scene.root.querySelector<HTMLElement>('[data-role="input"]');
  if (beat.dataset.wait === 'drill' && scene.waiting) {
    typing?.focus();
  } else {
    typing?.blur();
  }
  stageRun(scene.root, scene.beats, beat.dataset.wait === 'run' && scene.waiting);
};

const equip = (scene: Scene): void => {
  const beat = scene.beats[scene.index];
  if (beat === undefined || !supplied(scene)) {
    return;
  }
  direct(scene.root, scene.beats, scene.index);
  focusTyping(scene, beat);
};

const show = (scene: Scene): void => {
  const beat = scene.beats[scene.index];
  if (beat === undefined) {
    return;
  }
  showBeats(scene.beats, scene.index);
  scene.supply.advance(scene.index);
  grantUnlocks(scene.unit, beat);
  schedule(scene, beat);
  showStage(scene, beat);
  fillBoxes(scene, beat);
  equip(scene);
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
    if (beat !== undefined && scene.waiting && supplied(scene)) {
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
    setNote(scene, mismatchNote(scene.root, scene.beats[scene.index]));
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
      restart(scene.unit);
    },
    screen: () => {
      step(scene, 'SCREEN');
    },
  });
};

interface Held {
  scene: Scene | null;
}

const supplyFor = (root: HTMLElement, beats: readonly HTMLElement[], held: Held): Supply =>
  supplyScene(root, beats, () => {
    if (held.scene?.root.dataset.supplying === 'true') {
      equip(held.scene);
    }
  });

const startActor = (
  beats: readonly HTMLElement[],
  state: UnitState,
): Actor<typeof sceneMachine> => {
  const metas = beats.map((beat) => readMeta(beat));
  const actor = createActor(sceneMachine, {
    input: { beats: metas, passed: [...state.passed], position: state.position },
  });
  actor.start();
  return actor;
};

const build = (root: HTMLElement, read: ReadUnit): Scene => {
  const beats = [...root.querySelectorAll<HTMLElement>('[data-beat]')];
  const held: Held = { scene: null };
  const unit = root.dataset.unit ?? '';
  const actor = startActor(beats, read(unit));
  const first = actor.getSnapshot();
  held.scene = {
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
    supply: supplyFor(root, beats, held),
    timer: null,
    unit,
    waiting: first.matches('blocked'),
  };
  return held.scene;
};

const opening = 0;

const begin = (scene: Scene, early: Early): void => {
  if (scene.index !== opening) {
    startReveal(scene);
    early();
    return;
  }
  scene.actor.send({ type: 'REVEALED' });
  if (early()) {
    step(scene, 'NEXT');
  }
};

const mountScene = async (root: HTMLElement, read: ReadUnit, early: Early): Promise<void> => {
  const scene = build(root, read);
  await scene.supply.until(scene.index);
  for (const beat of scene.beats.slice(0, scene.index)) {
    fillInput(scene.stdin, beat);
    grantUnlocks(scene.unit, beat);
  }
  scene.actor.subscribe((snapshot) => {
    sync(scene, snapshot);
  });
  listen(scene);
  root.dataset.ready = 'true';
  show(scene);
  begin(scene, early);
};

export { mountScene };
