import { unitDomain, type UnitDomain } from '@/lib/learner/domain';
import { planFor, programOf, runToken, type Beat, type Plan, type Task } from '@/lib/unit/format';

import { beats as startBeats, starter as startStarter, tasks as startTasks } from './start';

interface Unit {
  readonly beats: readonly Beat[];
  readonly starter: string;
  readonly tasks: readonly Task[];
}

const fromEnd = -1;

const units: Record<string, Unit> = {
  start: { beats: startBeats, starter: startStarter, tasks: startTasks },
};

const starterOf = (unit: string): string | null => units[unit]?.starter ?? null;

const lastBefore = (unit: Unit, beat: string): Task | undefined => {
  const at = unit.beats.findIndex((other) => other.id === beat);
  const earlier = new Set(unit.beats.slice(0, Math.max(at, 0)).map((other) => other.id));
  return unit.tasks.filter((task) => earlier.has(task.id)).at(fromEnd);
};

const settled = (unit: Unit, beat: string): Plan | null => {
  const last = lastBefore(unit, beat);
  if (last === undefined) {
    return null;
  }
  const reached = planFor(unit.tasks, last.id);
  if (reached === null) {
    return null;
  }
  const history = [...reached.history, ...reached.path].filter((token) => token !== runToken);
  return { history, path: [] };
};

const planOf = (unit: string, beat: string): Plan | null => {
  const found = units[unit];
  if (found === undefined) {
    return null;
  }
  return planFor(found.tasks, beat) ?? settled(found, beat);
};

const beatsOf = (unit: string): readonly Beat[] => units[unit]?.beats ?? [];

interface Check {
  readonly expect: string;
  readonly id: string;
  readonly input: string;
  readonly program: string;
}

const checksOf = (unit: string): Check[] => {
  const found = units[unit];
  if (found === undefined) {
    return [];
  }
  return found.tasks.map((task) => ({
    expect: task.expect,
    id: task.id,
    input: task.input ?? '',
    program: programOf(found.starter, task.goal),
  }));
};

const allDomains = (): Readonly<Record<string, UnitDomain>> =>
  Object.fromEntries(Object.entries(units).map(([name, unit]) => [name, unitDomain(unit)]));

export { allDomains, beatsOf, checksOf, planOf, starterOf, type Check };
