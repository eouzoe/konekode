import { number, object, record, string, type ZodType } from 'zod';

import { keptKinds } from '@/lib/learner/kinds';
import { forgetRecorded, openLog, recorded, track } from '@/lib/record/current';

import { environment, replayWanted, siteVersion } from './environment';
import { noteFingerprint } from './fingerprint';
import { acknowledge, pendingBatches, settled, type Acked, type Batch } from './pending';
import { fitBytes, free, holdAfter, isDue, isHeld, prefixBatch, timing, type Hold } from './plan';
import { startReplay } from './replay';
import { stored, upload, uploadNow, type Answer, type Ticket } from './send';
import { watchPage } from './watch';

interface State {
  acked: Acked;
  busy: boolean;
  readonly forgotten: Set<string>;
  hold: Hold;
  readonly site: string;
}

const ackedKey = 'cp:intake:acked';
const holdKey = 'cp:intake:hold';
const ackedSchema = record(string(), number());
const holdSchema = object({ failures: number(), until: number() });
const checkEvery = 15_000;

const readStored = <Value>(key: string, schema: ZodType<Value>, fallback: Value): Value => {
  try {
    const parsed = schema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    return fallback;
  }
  return fallback;
};

const writeStored = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

const ticketOf = (state: State, batch: Batch): Ticket => ({
  actor: batch.actor,
  kind: 'events',
  seq: batch.seq,
  session: batch.session,
  site: state.site,
});

const noteHold = (answer: Answer, hold: Hold, now: number): void => {
  track('intake.held', {
    data: {
      failures: hold.failures,
      retryAfter: answer.retryAfter ?? '',
      status: answer.status,
      wait: hold.until - now,
    },
  });
};

const holdAs = (state: State, hold: Hold): void => {
  state.hold = hold;
  writeStored(holdKey, hold);
};

const accept = (state: State, batch: Batch): void => {
  state.acked = acknowledge(state.acked, batch);
  writeStored(ackedKey, state.acked);
  if (state.hold.failures > 0) {
    track('intake.recovered', { data: { failures: state.hold.failures } });
  }
  holdAs(state, free);
};

const settle = (state: State, batch: Batch, answer: Answer): boolean => {
  if (answer.status === stored) {
    accept(state, batch);
    return true;
  }
  const now = Date.now();
  holdAs(state, holdAfter(answer, now, state.hold));
  noteHold(answer, state.hold, now);
  return false;
};

const sendAll = async (state: State, batches: readonly Batch[]): Promise<void> => {
  const [batch, ...rest] = batches;
  if (batch === undefined) {
    return;
  }
  const answer = await upload(ticketOf(state, batch), JSON.stringify(batch.events));
  if (settle(state, batch, answer)) {
    await sendAll(state, rest);
  }
};

const prune = (state: State): void => {
  const ids = settled(recorded(), state.acked, keptKinds).filter((id) => !state.forgotten.has(id));
  for (const id of ids) {
    state.forgotten.add(id);
  }
  if (ids.length > 0) {
    forgetRecorded(ids);
  }
};

const pending = (state: State): Batch[] =>
  pendingBatches(recorded(), state.acked, timing.batchSize);

const drain = async (state: State): Promise<void> => {
  const batches = pending(state);
  if (state.busy || isHeld(state.hold, Date.now()) || !isDue(batches, Date.now())) {
    return;
  }
  state.busy = true;
  try {
    await sendAll(state, batches);
    prune(state);
  } finally {
    state.busy = false;
  }
};

const sendLast = async (state: State, part: Batch): Promise<void> => {
  state.busy = true;
  try {
    const answer = await uploadNow(ticketOf(state, part), JSON.stringify(part.events));
    settle(state, part, answer);
    prune(state);
  } finally {
    state.busy = false;
  }
};

const lastCall = (state: State): void => {
  const [batch] = pending(state);
  if (batch === undefined || state.busy || isHeld(state.hold, Date.now())) {
    return;
  }
  const part = prefixBatch(batch, fitBytes(batch.events));
  if (part !== null) {
    void sendLast(state, part);
  }
};

const startIntake = async (): Promise<void> => {
  await openLog();
  const state: State = {
    acked: readStored(ackedKey, ackedSchema, {}),
    busy: false,
    forgotten: new Set(),
    hold: readStored(holdKey, holdSchema, free),
    site: siteVersion(),
  };
  track('session.started', { data: environment(state.site) });
  watchPage();
  if (replayWanted()) {
    void startReplay(state.site);
  }
  void noteFingerprint();
  setInterval(() => {
    void drain(state);
  }, checkEvery);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastCall(state);
    }
  });
  globalThis.addEventListener('pagehide', () => {
    lastCall(state);
  });
};

export { startIntake };
