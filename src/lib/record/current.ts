import { faultCounts, onFault, report, type Fault } from '@/lib/fault/fault';
import { actorId, newId, sessionId } from '@/lib/identity/actor';
import { siteVersion } from '@/lib/site/version';
import { contentId } from '@/units/content';

import { browserPersistence, type Trouble } from './browser';
import { faultKind, faultSummaryKind, type LearningEvent } from './event';
import { createLog, type Entry, type Log, type StoreFault } from './log';

type Listener = (event: LearningEvent) => void;

interface Early {
  readonly entry: Entry;
  readonly kind: string;
}

const listeners: Listener[] = [];
const early: Early[] = [];
const nothing: readonly LearningEvent[] = [];
const earlyLimit = 500;

let opening: Promise<Log> | null = null;
let opened: Log | null = null;

const clockOrigin = Date.now() - performance.now();
const now = (): number => Math.round(clockOrigin + performance.now());

const isPowerOfTwo = (count: number): boolean => (count & (count - 1)) === 0;

const recorded = new Map<string, number>();

const keyOf = (kind: string, where: string): string => `${kind}\t${where}`;

const record = (log: Log, fault: Fault): void => {
  if (!isPowerOfTwo(fault.count)) {
    return;
  }
  recorded.set(keyOf(fault.kind, fault.where), fault.count);
  log.track(faultKind, {
    at: fault.at,
    data: { count: fault.count, kind: fault.kind, reason: fault.reason, where: fault.where },
  });
};

const unrecorded = (): string[] =>
  [...faultCounts().entries()]
    .filter(([key, count]) => (recorded.get(key) ?? 0) < count)
    .map(([key, count]) => `${key.replace('\t', '@')}=${String(count)}`);

const summarise = (log: Log): void => {
  const missing = unrecorded();
  const dropped = log.dropped();
  if (missing.length === 0 && dropped === 0) {
    return;
  }
  log.track(faultSummaryKind, { data: { counts: missing.join(','), dropped } });
  for (const [key, count] of faultCounts()) {
    recorded.set(key, count);
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
  unavailable: 'storage.unavailable',
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

const watchLog = (log: Log, trouble: Trouble, reason: unknown): void => {
  if (trouble !== '') {
    report(troubleKinds[trouble], 'open', reason);
  }
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
  watchLog(log, storage.trouble, storage.reason);
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

const recordedEvents = (): readonly LearningEvent[] => opened?.events() ?? nothing;

const onRecorded = (listener: Listener): void => {
  listeners.push(listener);
  opened?.subscribe(listener);
};

const flushLog = async (): Promise<void> => {
  await opened?.flush();
};

const forgetRecorded = (ids: readonly string[]): void => {
  opened?.forget(ids);
};

export { flushLog, forgetRecorded, onRecorded, openLog, recordedEvents as recorded, track };
