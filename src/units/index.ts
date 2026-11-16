import { planFor, type Plan } from '@/lib/unit/format';

import { starter as startStarter, tasks as startTasks } from './start';

interface Unit {
  readonly starter: string;
  readonly tasks: Parameters<typeof planFor>[0];
}

const units: Record<string, Unit> = {
  start: { starter: startStarter, tasks: startTasks },
};

const starterOf = (unit: string): string | null => units[unit]?.starter ?? null;

const planOf = (unit: string, beat: string): Plan | null => {
  const found = units[unit];
  if (found === undefined) {
    return null;
  }
  return planFor(found.tasks, beat);
};

export { planOf, starterOf };
