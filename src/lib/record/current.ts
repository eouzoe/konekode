import { faultCounts, onFault, report, type Fault } from '@/lib/fault/fault';
import { countOf, setCount, type Counted, type Tally } from '@/lib/fault/tally';
import { actorId, newId, sessionId } from '@/lib/identity/actor';
import { siteVersion } from '@/lib/site/version';
import { contentId } from '@/units/content';

import { browserPersistence, slowAfter, type Storage, type Trouble } from './browser';
import { faultKind, faultSummaryKind, type LearningEvent } from './event';
import { createLog, type Entry, type Log, type StoreFault } from './log';

type Listener = (event: LearningEvent) => void;

interface Early {
  readonly entry: Entry;
  readonly kind: string;
}

const listeners: Array<Listener> = [];
const early: Array<Early> = [];
const nothing: ReadonlyArray<LearningEvent> = [];
const earlyLimit = 500;

let opening: Promise<Log> | null = null;
let opened: Log | null = null;

const clockOrigin = Date.now() - performance.now();
const now = (): number => Math.round(clockOrigin + performance.now());

const isPowerOfTwo = (count: number): boolean => (count & (count - 1)) === 0;

const recorded: Tally = new Map();

const record = (log: Log, fault: Fault): void => {
  if (!isPowerOfTwo(fault.count)) {
    return;
  }
  setCount(recorded, fault);
  log.track(faultKind, {
    at: fault.at,
    data: { count: fault.count, kind: fault.kind, reason: fault.reason, where: fault.where },
  });
};

const unrecorded = (): Array<Counted> =>
  faultCounts().filter((fault) => countOf(recorded, fault.kind, fault.where) < fault.count);

const summarise = (log: Log): void => {
  const missing = unrecorded();
  const dropped = log.dropped();
  if (missing.length === 0 && dropped === 0) {
    return;
  }
  log.track(faultSummaryKind, { data: { counts: JSON.stringify(missing), dropped } });
  for (const fault of missing) {
    setCount(recorded, fault);
  }
};

const storeKinds: Readonly<Record<StoreFault['kind'], string>> = {
  dropped: 'storage.dropped',
  remove: 'storage.remove',
  write: 'storage.write',
};

const noteStoreFault = (fault: StoreFault): void => {
  report(storeKinds[fault.kind], 'events', fault.error);
};

const troubleKinds: Readonly<Record<Exclude<Trouble, ''>, string>> = {
  blocked: 'storage.blocked',
  stalled: 'storage.stalled',
  unavailable: 'storage.unavailable',
};

const awaitLate = async (later: Promise<number>): Promise<void> => {
  try {
    const waited = Math.round(await later);
    report('storage.recovered', 'open', new Error(`${String(waited)} ms`));
  } catch (error) {
    report('storage.unavailable', 'late', error);
  }
};

const noteOpening = ({ later, reason, took, trouble }: Storage): void => {
  if (trouble !== '') {
    report(troubleKinds[trouble], 'open', reason);
    if (later !== null) {
      void awaitLate(later);
    }
    return;
  }
  if (took > slowAfter) {
    const waited = Math.round(took);
    report('storage.slow', 'open', new Error(`${String(waited)} ms`));
  }
};

const noteLoaded = (log: Log): void => {
  const { unlabelled, unreadable } = log.loaded;
  if (unlabelled > 0 || unreadable > 0) {
    log.track('record.opened', { data: { unlabelled, unreadable } });
  }
};

const replayEarly = (log: Log): void => {
  for (const { entry, kind } of early.splice(0)) {
    log.track(kind, entry);
  }
};

const watchLog = (log: Log, storage: Storage): void => {
  noteOpening(storage);
  noteLoaded(log);
  onFault((fault) => {
    record(log, fault);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      summarise(log);
    }
  });
};

const start = async (): Promise<Log> => {
  const [storage, content] = await Promise.all([browserPersistence(), contentId()]);
  const log = await createLog({
    actor: actorId(),
    content,
    newId,
    now,
    onFault: noteStoreFault,
    persistence: storage.persistence,
    session: sessionId(),
    site: siteVersion(),
  });
  for (const listener of listeners) {
    log.subscribe(listener);
  }
  opened = log;
  replayEarly(log);
  watchLog(log, storage);
  return log;
};

const openLog = (): Promise<Log> => {
  opening ??= start();
  return opening;
};

const track = (kind: string, entry: Entry = {}): void => {
  if (opened !== null) {
    opened.track(kind, entry);
    return;
  }
  if (early.length < earlyLimit) {
    early.push({ entry: { ...entry, at: entry.at ?? now() }, kind });
    return;
  }
  report('record.early', kind, new Error('the log was not open yet'));
};

const recordedEvents = (): ReadonlyArray<LearningEvent> => opened?.events() ?? nothing;

const onRecorded = (listener: Listener): void => {
  listeners.push(listener);
  opened?.subscribe(listener);
};

const flushLog = async (): Promise<void> => {
  await opened?.flush();
};

const forgetRecorded = (ids: ReadonlyArray<string>): void => {
  opened?.forget(ids);
};

export { flushLog, forgetRecorded, onRecorded, openLog, recordedEvents as recorded, track };
