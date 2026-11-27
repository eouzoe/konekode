import { planFor, programOf, type Beat } from '@konekode/contracts/unit';
import { beats as allBeats, starter, tasks } from '@konekode/course/start';

import { createBuffer, type Buffer, type Rules } from '@/lib/edit/buffer';
import { expand } from '@/lib/edit/path';
import { knownKeys, step } from '@/lib/edit/step';
import { knownOutcome } from '@/lib/run/known';
import { isFullScreen } from '@/lib/scene/conditions';

const fromEnd = -1;

const rules: Rules = { keys: new Set([...knownKeys, 'i', 'Escape']), pairs: [] };

const shows = (beat: Beat, full: boolean): boolean =>
  beat.when === undefined || (beat.when === 'fullscreen') === full;

const beats: ReadonlyArray<Beat> = allBeats.filter((beat) => shows(beat, isFullScreen()));

const press = (buffer: Buffer, key: string): { buffer: Buffer; refused: boolean } =>
  step(buffer, key, rules);

const pressAll = (buffer: Buffer, keys: ReadonlyArray<string>): Buffer =>
  keys.reduce((now, key) => press(now, key).buffer, buffer);

const keysOfTokens = (tokens: ReadonlyArray<string>): Array<string> =>
  expand(tokens)
    .filter((item) => item.kind !== 'run')
    .map((item) => item.key);

const keysOfBeat = (beat: Beat): Array<string> => keysOfTokens(beat.keys ?? []);

const taskStart = (beatId: string): Buffer | undefined => {
  const plan = planFor(tasks, beatId);
  if (plan === null) {
    return undefined;
  }
  return pressAll(createBuffer(starter), keysOfTokens(plan.history));
};

const settled = (index: number): Buffer => {
  const later = beats.slice(index).find((beat) => planFor(tasks, beat.id) !== null);
  if (later !== undefined) {
    return taskStart(later.id) ?? createBuffer(starter);
  }
  const last = tasks.at(fromEnd);
  if (last === undefined) {
    return createBuffer(starter);
  }
  return createBuffer(programOf(starter, last.goal));
};

const resetBefore = (index: number): number => {
  let from = index;
  while (from > 0 && beats[from]?.keys?.[0] !== 'reset') {
    from -= 1;
  }
  return from;
};

const runBufferAt = (index: number): Buffer => {
  const beat = beats[index];
  if (beat === undefined) {
    return createBuffer(starter);
  }
  const start = taskStart(beat.id);
  if (start === undefined) {
    return settled(index);
  }
  if (beat.wait === 'run') {
    return start;
  }
  const before = beats.slice(resetBefore(index), index).flatMap((item) => keysOfBeat(item));
  return pressAll(start, before);
};

const keysNow = (beat: Beat): Array<string> => keysOfBeat(beat);

const runs = (beat: Beat): boolean => (beat.keys ?? []).includes('run');

const outputOf = (source: string, input: string): string | undefined => {
  const outcome = knownOutcome(source, input);
  if (outcome !== null && 'output' in outcome) {
    return outcome.output;
  }
  return undefined;
};

export {
  createDrill,
  escape as drillEscape,
  expectedChar,
  isDone as drillDone,
  isTyped as drillTyped,
  press as drillPress,
  type Drill,
} from '@/lib/typing/drill';
export { describeNext, needsTelling } from '@/lib/typing/hint';
export { messages } from '@/lib/typing/messages';
export { createBuffer, type Buffer } from '@/lib/edit/buffer';
export { type Beat } from '@konekode/contracts/unit';
export { starter, template } from '@konekode/course/start';
export { beats, keysNow, outputOf, press, runBufferAt, runs };
