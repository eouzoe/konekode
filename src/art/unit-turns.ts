import { cue } from '@konekode/views/sound';

import { diagnose } from '@/lib/run/diagnose';

import { inSequence, wait } from './dom';
import { tokensOf } from './drill-flow';
import { listen } from './turn';
import { keysNow, messages, press, runs, type Beat } from './unit';
import { parts } from './unit-parts';
import { shownMode } from './unit-view';

import type { Check } from '@/lib/scene/machine';

interface Turn {
  readonly beat: Beat;
  readonly check: (kind: Check, output: string) => void;
  readonly passed: () => boolean;
  readonly signal: AbortSignal;
}

const { drill, hint, keyboard, paper, run } = parts;

const pace = { demoKey: 0.6, demoLetter: 0.07 };
const words = {
  pressI: '按 i 切換成輸入模式',
  runHint: '改好之後，在一般模式按 Enter 執行。',
};
const turnState = { active: false };

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

const settle = (turn: Turn, kind: Check, output: string): boolean => {
  turn.check(kind, output);
  return turn.passed();
};

const drillKey = (turn: Turn, key: string): boolean => {
  const fine = drill.press(key);
  keyboard.flash(key);
  paper.draw();
  hint.textContent = drill.hint();
  keyboard.next(drill.nextKey());
  if (!fine) {
    paper.shake();
  }
  return drill.done() && settle(turn, 'drill', '');
};

const runOnce = async (turn: Turn): Promise<boolean> => {
  const output = await run.execute(turn.beat, turn.signal);
  if (output === undefined || turn.signal.aborted) {
    return false;
  }
  if (settle(turn, 'run', output)) {
    return true;
  }
  run.note(diagnose(turn.beat.expect ?? '', output));
  void cue('wrong');
  return false;
};

const handlerFor =
  (turn: Turn) =>
  (key: string): Promise<boolean> | boolean => {
    if (turn.beat.wait === 'drill') {
      return drillKey(turn, key);
    }
    if (turn.beat.wait === 'run' && key === 'Enter' && paper.state.buffer.mode === 'normal') {
      return runOnce(turn);
    }
    tap(key);
    return false;
  };

const begin = (beat: Beat): void => {
  if (beat.wait === 'drill') {
    hint.textContent = messages.begin;
    keyboard.next(drill.nextKey());
    return;
  }
  hint.textContent = words.runHint;
};

const studentTurn = async (turn: Turn): Promise<void> => {
  begin(turn.beat);
  turnState.active = true;
  try {
    await listen(keyboard, turn.signal, handlerFor(turn));
  } finally {
    turnState.active = false;
  }
  keyboard.next();
  if (turn.passed()) {
    void cue('correct');
    await run.celebrate();
  }
  hint.textContent = '';
};

const demoDrill = async (beat: Beat, signal: AbortSignal): Promise<void> => {
  await drill.play(tokensOf(beat.demo), signal);
  if (!signal.aborted && beat.id === 'press-i') {
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

const demoRun = async (beat: Beat, signal: AbortSignal): Promise<void> => {
  await inSequence(keysNow(beat), demoKey, signal);
  if (runs(beat) && !signal.aborted) {
    await run.execute(beat, signal);
  }
};

const playDemo = async (beat: Beat, signal: AbortSignal): Promise<void> => {
  if (!signal.aborted && beat.stage === 'drill') {
    await demoDrill(beat, signal);
  }
  if (!signal.aborted && beat.stage === 'run') {
    await demoRun(beat, signal);
  }
};

const release = (beat: Beat): void => {
  if (beat.id === 'press-i') {
    keyboard.up('i');
  }
};

const taking = (): boolean => turnState.active;

export { playDemo, release, studentTurn, taking, type Turn };
