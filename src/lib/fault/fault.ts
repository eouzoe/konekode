import { bump, counted, type Counted, type Tally } from './tally';

interface Fault {
  readonly at: number;
  readonly count: number;
  readonly kind: string;
  readonly reason: string;
  readonly where: string;
}

type Sink = (fault: Fault) => void;

const reasonLimit = 300;
const keptLimit = 200;

const sinks: Array<Sink> = [];
const kept: Array<Fault> = [];
const counts: Tally = new Map();

const reasonOf = (error: unknown): string => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, reasonLimit);
  }
  return String(error).slice(0, reasonLimit);
};

const deliver = (sink: Sink, fault: Fault): void => {
  try {
    sink(fault);
  } catch (error) {
    globalThis.console.error(error);
  }
};

const report = (kind: string, where: string, error: unknown): Fault => {
  const count = bump(counts, kind, where);
  const fault: Fault = { at: Date.now(), count, kind, reason: reasonOf(error), where };
  if (kept.length < keptLimit) {
    kept.push(fault);
  }
  for (const sink of sinks) {
    deliver(sink, fault);
  }
  return fault;
};

const onFault = (sink: Sink): void => {
  sinks.push(sink);
  for (const fault of kept) {
    deliver(sink, fault);
  }
};

const faultCounts = (): Array<Counted> => counted(counts);

const settle = async (where: string, work: Promise<unknown>): Promise<void> => {
  try {
    await work;
  } catch (error) {
    report('rejected', where, error);
  }
};

const guard = (where: string, work: Promise<unknown>): void => {
  void settle(where, work);
};

const placeOf = (event: ErrorEvent): string => {
  if (event.filename === '') {
    return 'page';
  }
  return `${event.filename}:${String(event.lineno)}:${String(event.colno)}`;
};

const watchUncaught = (): void => {
  globalThis.addEventListener('error', (event) => {
    if (event instanceof ErrorEvent) {
      report('uncaught', placeOf(event), event.error ?? event.message);
    }
  });
  globalThis.addEventListener('unhandledrejection', (event) => {
    if (event instanceof PromiseRejectionEvent) {
      report('rejected', 'unhandled', event.reason);
    }
  });
};

const resetFaults = (): void => {
  sinks.length = 0;
  kept.length = 0;
  counts.clear();
};

export {
  faultCounts,
  guard,
  onFault,
  reasonOf,
  report,
  resetFaults,
  watchUncaught,
  type Fault,
  type Sink,
};
