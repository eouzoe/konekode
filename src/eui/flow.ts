import { type Beat } from '@/lib/unit/format';

type Phase = 'blocked' | 'loading' | 'ready' | 'revealing';
type Check = 'drill' | 'run';

interface Where {
  readonly fine: boolean;
  readonly full: boolean;
}

interface Flow {
  readonly index: number;
  readonly mismatch: boolean;
  readonly passed: readonly string[];
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

const currentOf = (beats: readonly Beat[], flow: Flow): Beat | undefined => beats[flow.index];

const needsCheck = (beats: readonly Beat[], flow: Flow): boolean => {
  const beat = currentOf(beats, flow);
  return beat?.wait !== undefined && !flow.passed.includes(beat.id);
};

const seek = (beats: readonly Beat[], flow: Flow, step: number, where: Where): number => {
  let next = flow.index + step;
  while (next >= 0 && next < beats.length && !applies(beats[next], where)) {
    next += step;
  }
  if (next < 0 || next >= beats.length) {
    return flow.index;
  }
  return next;
};

const move = (beats: readonly Beat[], flow: Flow, step: number, where: Where): Flow | null => {
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

const settle = (beats: readonly Beat[], flow: Flow): Flow => ({
  ...flow,
  phase: needsCheck(beats, flow) ? 'blocked' : 'ready',
});

const goNext = (beats: readonly Beat[], flow: Flow, where: Where): Flow | null =>
  move(beats, flow, forward, where);

const goBack = (beats: readonly Beat[], flow: Flow, where: Where): Flow | null =>
  move(beats, flow, backward, where);

const revealed = (beats: readonly Beat[], flow: Flow): Flow | null =>
  flow.phase === 'revealing' ? settle(beats, flow) : null;

const checked = (
  beats: readonly Beat[],
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

const played = (beats: readonly Beat[], flow: Flow, where: Where): Flow | null =>
  currentOf(beats, flow)?.after === 'next' ? goNext(beats, flow, where) : null;

const startAt = (beats: readonly Beat[], position: string | null): number =>
  Math.max(
    beats.findIndex((beat) => beat.id === position),
    0,
  );

const isShown = (beats: readonly Beat[], index: number, at: number): boolean =>
  at <= index && beats.slice(at + forward, index + forward).every((beat) => beat.append === true);

export {
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
