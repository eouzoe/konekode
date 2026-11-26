import { catalog } from '@/lib/complete/catalog';
import { createEngine } from '@/lib/complete/engine';
import { createBuffer, type Buffer, type Rules } from '@/lib/edit/buffer';
import { expand, keysOf } from '@/lib/edit/path';
import { knownKeys, run } from '@/lib/edit/step';
import { chunks, firstChunk } from '@/lib/perform/rhythm';
import {
  createDrill,
  escape,
  expectedChar,
  isTyped,
  press,
  remind,
  type Drill,
} from '@/lib/typing/drill';
import { typeInto } from '@/lib/typing/keypress';
import { planOf } from '@/units/index';

import type { Session } from '@/lib/edit/session';
import type { Beat } from '@/lib/unit/format';

interface DrillShow {
  readonly demo: boolean;
  readonly guide: boolean;
  readonly pretend: string;
  readonly show: Drill;
}

interface Move {
  readonly keys: ReadonlyArray<string>;
  readonly label: string;
  readonly runs: boolean;
  readonly wait: number;
}

interface Next<State, Item> {
  readonly delay: number;
  readonly queue: ReadonlyArray<Item>;
  readonly state: State;
}

const stepDelay = 420;
const keyPause = 450;
const instant = new Set(['hint', 'hush']);
const labels: Readonly<Record<string, string>> = { BS: 'Backspace', run: 'Enter' };
const typePrefix = 'type:';

const rulesOf = (unlocked: ReadonlyArray<string>): Rules => {
  const engine = createEngine(catalog, () => new Set(unlocked));
  return { keys: engine.keys(), pairs: engine.pairs() };
};

const everything = (rules: Rules): Rules => ({ keys: knownKeys, pairs: rules.pairs });

const words = (script: string | undefined): Array<string> =>
  (script ?? '').split(' ').filter((word) => word !== '');

const fillAll = (drill: Drill): Drill => {
  let next = drill;
  while (!isTyped(next)) {
    next = press(next, expectedChar(next));
  }
  return next;
};

const drillAct = (state: DrillShow, token: string): DrillShow => {
  const [name = '', value = ''] = token.split(':');
  const base = name === 'show' ? state : { ...state, pretend: '' };
  const acts: Readonly<Record<string, () => DrillShow>> = {
    demo: () => ({ ...base, demo: true }),
    esc: () => ({ ...base, show: escape(base.show) }),
    fill: () => ({ ...base, show: fillAll(base.show) }),
    hint: () => ({ ...base, guide: true, show: remind(base.show, 'none') }),
    hush: () => ({ ...base, guide: false }),
    key: () => ({ ...base, show: press(base.show, value) }),
    live: () => ({ ...base, demo: false }),
    reset: () => ({ ...base, guide: false, show: createDrill(base.show.target) }),
    show: () => ({ ...base, pretend: value }),
  };
  return acts[name]?.() ?? base;
};

const demoStart = (beats: ReadonlyArray<Beat>, index: number): number =>
  beats.findLastIndex((beat, at) => at <= index && (beat.demo ?? '').startsWith('reset'));

const drillStart = (
  beats: ReadonlyArray<Beat>,
  index: number,
  target: string,
): { readonly queue: ReadonlyArray<string>; readonly state: DrillShow } | null => {
  const beat = beats[index];
  const start = demoStart(beats, index);
  if (beat?.stage !== 'drill' || start < 0) {
    return null;
  }
  const fresh: DrillShow = { demo: false, guide: false, pretend: '', show: createDrill(target) };
  const before = beats.slice(start, index).flatMap((earlier) => words(earlier.demo));
  return {
    queue: words(beat.demo),
    state: before.reduce((state, token) => drillAct(state, token), fresh),
  };
};

const drillStep = (state: DrillShow, queue: ReadonlyArray<string>): Next<DrillShow, string> => {
  const [token, ...rest] = queue;
  if (token === undefined) {
    return { delay: 0, queue: [], state };
  }
  if (token === 'fill') {
    if (isTyped(state.show)) {
      return { delay: 0, queue: rest, state };
    }
    const chunk = firstChunk(state.show.target.slice(state.show.position));
    return {
      delay: chunk.pause,
      queue,
      state: { ...state, show: typeInto(state.show, chunk.text) },
    };
  }
  const delay = instant.has(token) ? 0 : stepDelay;
  return { delay, queue: rest, state: drillAct(state, token) };
};

const movesOf = (token: string): Array<Move> => {
  if (token.startsWith(typePrefix)) {
    return chunks(token.slice(typePrefix.length)).map((chunk) => ({
      keys: chunk.text.split(''),
      label: '',
      runs: false,
      wait: chunk.pause,
    }));
  }
  const keys = keysOf([token]);
  const runs = token === 'run';
  if (keys.length === 0 && !runs) {
    return [];
  }
  return [{ keys, label: labels[token] ?? token, runs, wait: keyPause }];
};

const startOf = (origin: string, history: ReadonlyArray<string>, rules: Rules): Buffer =>
  run(createBuffer(origin), keysOf(history), everything(rules));

const keysStart = (beats: ReadonlyArray<Beat>, index: number): number =>
  beats.findLastIndex((beat, at) => at <= index && beat.keys?.[0] === 'reset');

const runStart = (
  beats: ReadonlyArray<Beat>,
  index: number,
  unit: string,
  origin: string,
  rules: Rules,
): {
  readonly goal: string;
  readonly queue: ReadonlyArray<Move>;
  readonly sprite: Buffer;
} | null => {
  const beat = beats[index];
  if (beat?.stage !== 'run' || beat.keys === undefined) {
    return null;
  }
  const plan = planOf(unit, beat.id);
  const start = startOf(origin, plan?.history ?? [], rules);
  const before = beats
    .slice(Math.max(keysStart(beats, index), 0), index)
    .flatMap((earlier) => earlier.keys ?? []);
  return {
    goal: run(start, keysOf(plan?.path ?? []), everything(rules)).text,
    queue: beat.keys.flatMap((token) => movesOf(token)),
    sprite: run(start, keysOf(before), everything(rules)),
  };
};

const runStep = (
  sprite: Buffer,
  queue: ReadonlyArray<Move>,
  rules: Rules,
): Next<Buffer, Move> & { readonly runs: boolean } => {
  const [move, ...rest] = queue;
  if (move === undefined) {
    return { delay: 0, queue: [], runs: false, state: sprite };
  }
  if (move.runs) {
    return { delay: move.wait, queue: rest, runs: true, state: sprite };
  }
  return {
    delay: move.wait,
    queue: rest,
    runs: false,
    state: run(sprite, move.keys, everything(rules)),
  };
};

const studentTurn = (
  unit: string,
  beat: Beat,
  origin: string,
  rules: Rules,
  current: Session,
): Session => {
  const plan = planOf(unit, beat.id);
  if (plan === null) {
    return { ...current, at: 0, path: [] };
  }
  if (plan.path.length > 0) {
    return { at: 0, buffer: startOf(origin, plan.history, rules), path: expand(plan.path) };
  }
  if (current.buffer.change.length === 0 && plan.history.length > 0) {
    return { at: 0, buffer: startOf(origin, plan.history, rules), path: [] };
  }
  return { ...current, at: 0, path: [] };
};

export {
  drillStart,
  drillStep,
  rulesOf,
  runStart,
  runStep,
  studentTurn,
  type DrillShow,
  type Move,
};
