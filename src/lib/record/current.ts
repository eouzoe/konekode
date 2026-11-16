import { actorId, newId, sessionId } from '@/lib/identity/actor';

import { browserPersistence } from './browser';
import { type LearningEvent } from './event';
import { createLog, type Entry, type Log } from './log';

type Listener = (event: LearningEvent) => void;

const listeners: Listener[] = [];
const nothing: readonly LearningEvent[] = [];

let opening: Promise<Log> | null = null;
let opened: Log | null = null;

const start = async (): Promise<Log> => {
  const log = await createLog({
    actor: actorId(),
    newId,
    now: () => Date.now(),
    persistence: await browserPersistence(),
    session: sessionId(),
  });
  for (const listener of listeners) {
    log.subscribe(listener);
  }
  opened = log;
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
