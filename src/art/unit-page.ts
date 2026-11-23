import { gsap } from 'gsap';

import { element, inSequence, wait } from './dom';
import { tokensOf } from './drill-flow';
import { saveProgress } from './progress';
import { listen, waitForNext } from './turn';
import { beats, keysNow, messages, press, runs, type Beat } from './unit';
import { parts } from './unit-parts';
import { setMode, setScene, shownMode } from './unit-view';

const { dialogue, drill, hint, keyboard, paper, run } = parts;

const pace = { demoKey: 0.6, demoLetter: 0.07 };
const words = {
  pressI: '按 i 切換成輸入模式',
  runHint: '改好之後，在一般模式按 Enter 執行。',
};
const millisecond = 1000;

const turn = { generation: 0, index: 0 };

const liveFor = (mine: number) => (): boolean => mine === turn.generation;

const tap = (key: string): void => {
  const result = press(paper.state.buffer, key);
  paper.state.buffer = result.buffer;
  keyboard.flash(key);
  if (shownMode() === 'run') {
    paper.showKey(key);
  }
  paper.draw();
  if (result.refused) {
    paper.shake();
  }
};

const drillKey = (key: string): boolean => {
  const fine = drill.press(key);
  keyboard.flash(key);
  paper.draw();
  hint.textContent = drill.hint();
  keyboard.next(drill.nextKey());
  if (!fine) {
    paper.shake();
  }
  return drill.done();
};

const handlerFor =
  (beat: Beat, live: () => boolean) =>
  (key: string): Promise<boolean> | boolean => {
    if (beat.wait === 'drill') {
      return drillKey(key);
    }
    if (beat.wait === 'run' && key === 'Enter' && paper.state.buffer.mode === 'normal') {
      return run.execute(beat, live);
    }
    tap(key);
    return false;
  };

const studentTurn = async (beat: Beat, live: () => boolean): Promise<void> => {
  if (beat.wait === 'drill') {
    hint.textContent = messages.begin;
    keyboard.next(drill.nextKey());
  } else {
    hint.textContent = words.runHint;
  }
  await listen(keyboard, live, handlerFor(beat, live));
  if (live()) {
    await run.celebrate();
  }
  keyboard.next();
  hint.textContent = '';
};

const demoDrill = async (beat: Beat, live: () => boolean): Promise<void> => {
  await drill.play(tokensOf(beat.demo), live);
  if (live() && beat.id === 'press-i') {
    keyboard.down('i');
    hint.textContent = words.pressI;
  }
};

const pauseAfter = (key: string): number => {
  if (key.length === 1 && paper.state.buffer.mode === 'insert') {
    return pace.demoLetter;
  }
  return pace.demoKey;
};

const demoKey = async (key: string): Promise<void> => {
  tap(key);
  await wait(pauseAfter(key));
};

const demoRun = async (beat: Beat, live: () => boolean): Promise<void> => {
  await inSequence(keysNow(beat), demoKey, live);
  if (runs(beat) && live()) {
    await run.execute(beat, live);
  }
};

const playBeat = async (beat: Beat, live: () => boolean): Promise<void> => {
  if (live() && beat.stage === 'drill') {
    await demoDrill(beat, live);
  }
  if (live() && beat.stage === 'run') {
    await demoRun(beat, live);
  }
  if (live() && beat.wait !== undefined) {
    await studentTurn(beat, live);
  }
  if (live() && beat.id === 'press-i') {
    keyboard.up('i');
  }
};

const afterBeat = async (beat: Beat): Promise<void> => {
  if (beat.auto !== undefined) {
    await wait(beat.auto / millisecond);
  } else if (beat.after !== 'next') {
    dialogue.showMore();
    await waitForNext('.controls');
  }
};

const present = async (at: number, beat: Beat, instant: boolean): Promise<void> => {
  turn.index = at;
  saveProgress(at);
  await setMode(beat.stage, instant);
  setScene(at, beat);
  await dialogue.say(beat.say, { append: beat.append === true, instant });
};

const showBeat = async (at: number, live: () => boolean, instant: boolean): Promise<void> => {
  const beat = beats[at];
  if (beat === undefined || !live()) {
    return;
  }
  await present(at, beat, instant);
  await playBeat(beat, live);
  if (live()) {
    await afterBeat(beat);
  }
  await showBeat(at + 1, live, false);
};

const loop = async (from: number, instant: boolean): Promise<void> => {
  turn.generation += 1;
  await showBeat(from, liveFor(turn.generation), instant);
};

const startAt = (): number => {
  const asked = Number(new URLSearchParams(location.search).get('at') ?? 0);
  if (Number.isInteger(asked) && asked >= 0) {
    return asked;
  }
  return 0;
};

const lineBefore = (at: number): number => {
  const target = Math.max(at - 1, 0);
  const start = beats.findLastIndex((beat, position) => position <= target && beat.append !== true);
  return Math.max(start, 0);
};

document.addEventListener(
  'keydown',
  () => {
    dialogue.hurry();
  },
  { capture: true },
);

element('back').addEventListener('click', () => {
  void loop(lineBefore(turn.index), true);
});

element('restart').addEventListener('click', () => {
  void loop(0, true);
});

gsap.set(['#desk', '#work', '#done', '#io', '#keycap', '#keyboard'], { autoAlpha: 0 });
const first = startAt();
void loop(first, first > 0);

if (import.meta.env.DEV) {
  Object.assign(globalThis, {
    beats,
    gsap,
    jump: async (at: number) => {
      await loop(at, true);
    },
  });
}
