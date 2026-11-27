import { catalog } from '@konekode/contracts/catalog';
import {
  planFor,
  programOf,
  runToken,
  type Beat,
  type Plan,
  type Task,
} from '@konekode/contracts/unit';

import { beats as startBeats, starter as startStarter, tasks as startTasks } from './start';

interface Unit {
  readonly beats: ReadonlyArray<Beat>;
  readonly starter: string;
  readonly tasks: ReadonlyArray<Task>;
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

const beatsOf = (unit: string): ReadonlyArray<Beat> => units[unit]?.beats ?? [];

interface Check {
  readonly expect: string;
  readonly id: string;
  readonly input: string;
  readonly program: string;
}

const checksOf = (unit: string): Array<Check> => {
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

interface UnitCheck extends Check {
  readonly unit: string;
}

const allChecks = (): Array<UnitCheck> =>
  Object.keys(units).flatMap((unit) =>
    checksOf(unit).map((check) => ({
      expect: check.expect,
      id: check.id,
      input: check.input,
      program: check.program,
      unit,
    })),
  );

const pathFor = (unit: string, beat: string): ReadonlyArray<string> =>
  planOf(unit, beat)?.path ?? [];

const unitContent = (): unknown => ({ catalog, units });

const engineContent = (version: string): string => JSON.stringify({ catalog, units, version });

export {
  allChecks,
  beatsOf,
  checksOf,
  engineContent,
  pathFor,
  planOf,
  starterOf,
  unitContent,
  units,
  type Unit,
  type Check,
  type UnitCheck,
};
