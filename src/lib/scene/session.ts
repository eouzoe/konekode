import { unitState, type UnitState } from '@/lib/learner/progress';
import { flushLog, openLog, track } from '@/lib/record/current';
import { clearDraft } from '@/lib/run/draft';
import { shownAt } from '@/units/index';

type ReadUnit = (unit: string) => UnitState;

const openSession = async (): Promise<ReadUnit> => {
  const log = await openLog();
  return (unit) => unitState(log.events(), unit);
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

export { noteCheck, noteReached, openSession, restartUnit, type ReadUnit };
