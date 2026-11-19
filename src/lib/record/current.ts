import { actorId, newId, sessionId } from '@/lib/identity/actor';
import { siteVersion } from '@/lib/site/version';
import { contentId } from '@/units/content';

import { browserPersistence } from './browser';
import { type LearningEvent } from './event';
import { createLog, type Entry, type Log } from './log';

type Listener = (event: LearningEvent) => void;

const listeners: Listener[] = [];
const nothing: readonly LearningEvent[] = [];

const reasonLimit = 300;

let opening: Promise<Log> | null = null;
let opened: Log | null = null;
let faulted = false;

const noteFault = (error: unknown): void => {
  if (!faulted) {
    faulted = true;
    opened?.track('storage.failed', { data: { reason: String(error).slice(0, reasonLimit) } });
  }
};

const clockOrigin = Date.now() - performance.now();

const noteLoaded = (log: Log): void => {
  const { unlabelled, unreadable } = log.loaded;
  if (unlabelled > 0 || unreadable > 0) {
    log.track('record.opened', { data: { unlabelled, unreadable } });
  }
};

const start = async (): Promise<Log> => {
  const [storage, content] = await Promise.all([browserPersistence(), contentId()]);
  const log = await createLog({
    actor: actorId(),
    content,
    newId,
    now: () => Math.round(clockOrigin + performance.now()),
    onFault: noteFault,
    persistence: storage.persistence,
    session: sessionId(),
    site: siteVersion(),
  });
  for (const listener of listeners) {
    log.subscribe(listener);
  }
  opened = log;
  if (!storage.durable) {
    log.track('storage.unavailable', { data: { reason: storage.reason.slice(0, reasonLimit) } });
  }
  noteLoaded(log);
  return log;
};

const openLog = (): Promise<Log> => {
  opening ??= start();
  return opening;
};

const track = (kind: string, entry?: Entry): void => {
  opened?.track(kind, entry);
};

const recorded = (): readonly LearningEvent[] => opened?.events() ?? nothing;

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

export { flushLog, forgetRecorded, onRecorded, openLog, recorded, track };
