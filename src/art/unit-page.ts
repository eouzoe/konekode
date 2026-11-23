import { gsap } from 'gsap';

import { isFullScreen, watchFullScreen } from '@/lib/scene/conditions';

import { calm, onMotion } from './motion';
import { cue, music, probe } from './sound';
import { beats, type Beat } from './unit';
import { sceneAt, type Scene } from './unit-actor';
import { listenMoves } from './unit-input';
import { parts } from './unit-parts';
import { playDemo, release, studentTurn, taking, type Turn } from './unit-turns';
import { setMode, setScene } from './unit-view';

interface View {
  acted: number;
  first: boolean;
  index: number;
  leaving: AbortController;
  presenting: Promise<void>;
  scene: Scene | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const view: View = {
  acted: -1,
  first: true,
  index: -1,
  leaving: new AbortController(),
  presenting: Promise.resolve(),
  scene: null,
  timer: null,
};

const screen = (): { readonly full: boolean } => ({ full: isFullScreen() });

const clearTimer = (): void => {
  if (view.timer !== null) {
    clearTimeout(view.timer);
    view.timer = null;
  }
};

const instantFor = (index: number, revealing: boolean): boolean => {
  const instant = !revealing || calm() || (view.first && index > 0);
  view.first = false;
  return instant;
};

const present = async (scene: Scene, index: number, revealing: boolean): Promise<void> => {
  const beat = beats[index];
  const { signal } = view.leaving;
  if (beat === undefined) {
    return;
  }
  const instant = instantFor(index, revealing);
  await setMode(beat.stage, instant);
  setScene(index, beat);
  await parts.dialogue.say(beat.say, { append: beat.append === true, instant });
  if (!signal.aborted) {
    scene.send({ type: 'REVEALED' });
  }
};

const afterward = (scene: Scene, beat: Beat): void => {
  if (beat.auto !== undefined) {
    view.timer = setTimeout(() => {
      scene.send({ ...screen(), type: 'AUTO' });
    }, beat.auto);
    return;
  }
  if (beat.after !== 'next') {
    parts.dialogue.showMore();
  }
};

const turnFor = (scene: Scene, beat: Beat, signal: AbortSignal): Turn => ({
  beat,
  check: (kind, output) => {
    if (!signal.aborted) {
      scene.send({ ...screen(), kind, output, type: 'CHECKED' });
    }
  },
  passed: () => scene.getSnapshot().context.passed.includes(beat.id),
  signal,
});

const finishTurn = async (scene: Scene, beat: Beat, signal: AbortSignal): Promise<void> => {
  if (scene.getSnapshot().matches('blocked')) {
    await studentTurn(turnFor(scene, beat, signal));
    return;
  }
  scene.send({ ...screen(), type: 'PLAYED' });
};

const perform = async (scene: Scene, beat: Beat, signal: AbortSignal): Promise<void> => {
  await playDemo(beat, signal);
  if (!signal.aborted) {
    await finishTurn(scene, beat, signal);
  }
  release(beat);
  if (!signal.aborted) {
    afterward(scene, beat);
  }
};

const act = async (scene: Scene, index: number): Promise<void> => {
  const beat = beats[index];
  const { signal } = view.leaving;
  await view.presenting;
  if (beat !== undefined && !signal.aborted) {
    await perform(scene, beat, signal);
  }
};

const enter = (scene: Scene, index: number, revealing: boolean): void => {
  clearTimer();
  view.leaving.abort();
  view.leaving = new AbortController();
  view.index = index;
  view.presenting = present(scene, index, revealing);
};

const sync = (scene: Scene): void => {
  const snapshot = scene.getSnapshot();
  const { index } = snapshot.context;
  Object.assign(parts.ui.dataset, { beat: beats[index]?.id ?? '', state: snapshot.value });
  if (index !== view.index) {
    enter(scene, index, snapshot.matches('revealing'));
  } else if (!snapshot.matches('revealing')) {
    parts.dialogue.hurry();
  }
  const settled = snapshot.matches('ready') || snapshot.matches('blocked');
  if (settled && view.acted !== index) {
    view.acted = index;
    void act(scene, index);
  }
};

const start = (at: number): void => {
  view.scene?.stop();
  view.leaving.abort();
  clearTimer();
  parts.run.clear();
  Object.assign(view, { acted: -1, first: true, index: -1 });
  const scene = sceneAt(at);
  view.scene = scene;
  scene.subscribe(() => {
    sync(scene);
  });
  scene.start();
};

const startAt = (): number => {
  const asked = Number(new URLSearchParams(location.search).get('at') ?? 0);
  if (Number.isInteger(asked) && asked >= 0) {
    return asked;
  }
  return 0;
};

const step = (type: 'BACK' | 'NEXT' | 'SCREEN'): void => {
  view.scene?.send({ ...screen(), type });
};

listenMoves(parts.ui, {
  back: () => {
    cue('click');
    step('BACK');
  },
  next: () => {
    step('NEXT');
  },
  restart: () => {
    cue('click');
    start(0);
  },
  taking,
});
music('study');
watchFullScreen(() => {
  step('SCREEN');
});
onMotion((motion) => {
  void parts.stage.motion(motion);
});

gsap.set(['#desk', '#work', '#done', '#io', '#keycap', '#keyboard'], { autoAlpha: 0 });
start(startAt());

if (import.meta.env.DEV) {
  Object.assign(globalThis, {
    beats,
    gsap,
    jump: (at: number) => {
      start(at);
    },
    soundProbe: probe,
    stage: parts.stage,
  });
}
