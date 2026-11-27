import type { Beat } from '@konekode/contracts/unit';

type Phase = 'blocked' | 'loading' | 'ready' | 'revealing';
type Check = 'drill' | 'run';

interface Where {
  readonly fine: boolean;
  readonly full: boolean;
}

interface Flow {
  readonly index: number;
  readonly mismatch: boolean;
  readonly passed: ReadonlyArray<string>;
  readonly phase: Phase;
}

const forward = 1;
const backward = -1;

const applies = (beat: Beat | undefined, where: Where): boolean => {
  if (beat === undefined) {
    return true;
  }
  if (beat.needs === 'fullscreen-key' && !where.fine) {
    return false;
  }
  if (beat.when === undefined) {
    return true;
  }
  return (beat.when === 'fullscreen') === where.full;
};

const currentOf = (beats: ReadonlyArray<Beat>, flow: Flow): Beat | undefined => beats[flow.index];

const needsCheck = (beats: ReadonlyArray<Beat>, flow: Flow): boolean => {
  const beat = currentOf(beats, flow);
  return beat?.wait !== undefined && !flow.passed.includes(beat.id);
};

const seek = (beats: ReadonlyArray<Beat>, flow: Flow, step: number, where: Where): number => {
  let next = flow.index + step;
  while (next >= 0 && next < beats.length && !applies(beats[next], where)) {
    next += step;
  }
  if (next < 0 || next >= beats.length) {
    return flow.index;
  }
  return next;
};

const move = (beats: ReadonlyArray<Beat>, flow: Flow, step: number, where: Where): Flow | null => {
  const index = seek(beats, flow, step, where);
  if (index === flow.index || (step > 0 && needsCheck(beats, flow))) {
    return null;
  }
  const next = { ...flow, index, mismatch: false };
  if (step < 0) {
    return settle(beats, next);
  }
  return { ...next, phase: 'revealing' };
};

const settle = (beats: ReadonlyArray<Beat>, flow: Flow): Flow => ({
  ...flow,
  phase: needsCheck(beats, flow) ? 'blocked' : 'ready',
});

const goNext = (beats: ReadonlyArray<Beat>, flow: Flow, where: Where): Flow | null =>
  move(beats, flow, forward, where);

const goBack = (beats: ReadonlyArray<Beat>, flow: Flow, where: Where): Flow | null =>
  move(beats, flow, backward, where);

const revealed = (beats: ReadonlyArray<Beat>, flow: Flow): Flow | null =>
  flow.phase === 'revealing' ? settle(beats, flow) : null;

const checked = (
  beats: ReadonlyArray<Beat>,
  flow: Flow,
  where: Where,
  report: { readonly kind: Check; readonly output: string },
): Flow | null => {
  const beat = currentOf(beats, flow);
  if (beat === undefined || beat.wait !== report.kind || flow.passed.includes(beat.id)) {
    return null;
  }
  if (beat.expect !== undefined && report.output.trim() !== beat.expect) {
    return { ...flow, mismatch: true };
  }
  const passed = { ...flow, mismatch: false, passed: [...flow.passed, beat.id] };
  if (report.kind === 'drill') {
    return { ...passed, phase: 'ready' };
  }
  return goNext(beats, passed, where) ?? { ...passed, phase: 'ready' };
};

const played = (beats: ReadonlyArray<Beat>, flow: Flow, where: Where): Flow | null =>
  currentOf(beats, flow)?.after === 'next' ? goNext(beats, flow, where) : null;

const adapted = (beats: ReadonlyArray<Beat>, flow: Flow, where: Where): Flow | null => {
  if (
    !where.full ||
    flow.phase === 'blocked' ||
    flow.phase === 'loading' ||
    needsCheck(beats, flow) ||
    currentOf(beats, flow)?.when === 'fullscreen'
  ) {
    return null;
  }
  const index = [flow.index + forward, flow.index + backward].find(
    (at) => beats[at]?.when === 'fullscreen',
  );
  return index === undefined ? null : { ...flow, index, mismatch: false, phase: 'revealing' };
};

const startAt = (beats: ReadonlyArray<Beat>, position: string | null, where: Where): number => {
  const at = Math.max(
    beats.findIndex((beat) => beat.id === position),
    0,
  );
  const shown = beats.findIndex((beat, index) => index >= at && applies(beat, where));
  return shown === -1 ? at : shown;
};

const isShown = (beats: ReadonlyArray<Beat>, index: number, at: number): boolean =>
  at <= index && beats.slice(at + forward, index + forward).every((beat) => beat.append === true);

export {
  adapted,
  applies,
  checked,
  currentOf,
  goBack,
  goNext,
  isShown,
  needsCheck,
  played,
  revealed,
  settle,
  startAt,
  type Check,
  type Flow,
  type Phase,
  type Where,
};
