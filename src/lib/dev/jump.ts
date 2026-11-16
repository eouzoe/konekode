interface Stop {
  readonly id: string;
  readonly wait?: string;
}

interface Entry {
  readonly kind: 'beat.reached' | 'check.passed' | 'unit.restarted';
  readonly ref: string;
}

const missing = -1;

const jumpTo = (stops: readonly Stop[], target: string): Entry[] => {
  const at = stops.findIndex((stop) => stop.id === target);
  if (at === missing) {
    return [];
  }
  const passed: Entry[] = stops
    .slice(0, at)
    .filter((stop) => stop.wait !== undefined)
    .map((stop) => ({ kind: 'check.passed', ref: stop.id }));
  return [{ kind: 'unit.restarted', ref: '' }, ...passed, { kind: 'beat.reached', ref: target }];
};

const skipFrom = (stops: readonly Stop[], current: string): Entry[] => {
  const at = stops.findIndex((stop) => stop.id === current);
  const here = stops[at];
  const next = stops[at + 1];
  if (here === undefined || next === undefined) {
    return [];
  }
  return [
    { kind: 'check.passed', ref: here.id },
    { kind: 'beat.reached', ref: next.id },
  ];
};

export { jumpTo, skipFrom, type Entry, type Stop };
