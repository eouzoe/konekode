import { guard } from '@/lib/fault/fault';
import { openEngine, shownAt, unitProgress, type UnitState } from '@/lib/learner/engine';
import { flushLog, track } from '@/lib/record/current';
import { clearDraft } from '@/lib/run/draft';

type ReadUnit = (unit: string) => UnitState;

const openSession = async (): Promise<ReadUnit> => {
  await openEngine();
  return unitProgress;
};

const noteReached = (unit: string, beat: string): void => {
  track('beat.reached', { data: { shows: shownAt(unit, beat).join(',') }, ref: beat, unit });
};

const noteCheck = (unit: string, beat: string): void => {
  track('check.passed', { ref: beat, unit });
};

const restartUnit = async (unit: string): Promise<void> => {
  track('unit.restarted', { unit });
  clearDraft(unit);
  await flushLog();
  globalThis.location.reload();
};

const restart = (unit: string): void => {
  guard('restart', restartUnit(unit));
};

export { noteCheck, noteReached, openSession, restart, type ReadUnit };
