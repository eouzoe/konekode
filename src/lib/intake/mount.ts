import { number, record, string } from 'zod';

import { keptKinds } from '@/lib/learner/kinds';
import { forgetRecorded, openLog, recorded, track } from '@/lib/record/current';

import { environment, siteVersion } from './environment';
import { noteFingerprint } from './fingerprint';
import { acknowledge, pendingBatches, settled, type Acked, type Batch } from './pending';
import { startReplay } from './replay';
import { keepaliveLimit, upload, uploadLast, type Ticket } from './send';
import { watchPage } from './watch';

interface State {
  acked: Acked;
  busy: boolean;
  failures: number;
  readonly forgotten: Set<string>;
  readonly site: string;
}

const ackedKey = 'cp:intake:acked';
const ackedSchema = record(string(), number());
const batchSize = 200;
const firstDelay = 2000;
const period = 20_000;

const readAcked = (): Acked => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(ackedKey) ?? '{}');
    const parsed = ackedSchema.safeParse(stored);
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    return {};
  }
  return {};
};

const writeAcked = (acked: Acked): boolean => {
  try {
    localStorage.setItem(ackedKey, JSON.stringify(acked));
    return true;
  } catch {
    return false;
  }
};

const noteRecovery = (state: State): void => {
  if (state.failures > 0) {
    track('intake.recovered', { data: { failures: state.failures } });
    state.failures = 0;
  }
};

const ticketOf = (state: State, batch: Batch): Ticket => ({
  actor: batch.actor,
  kind: 'events',
  seq: batch.seq,
  session: batch.session,
  site: state.site,
});

const sendAll = async (state: State, batches: readonly Batch[]): Promise<void> => {
  const [batch, ...rest] = batches;
  if (batch === undefined) {
    return;
  }
  if (!(await upload(ticketOf(state, batch), JSON.stringify(batch.events)))) {
    state.failures += 1;
    return;
  }
  state.acked = acknowledge(state.acked, batch);
  writeAcked(state.acked);
  noteRecovery(state);
  await sendAll(state, rest);
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

const drain = async (state: State): Promise<void> => {
  if (state.busy) {
    return;
  }
  state.busy = true;
  try {
    await sendAll(state, pendingBatches(recorded(), state.acked, batchSize));
    prune(state);
  } finally {
    state.busy = false;
  }
};

const lastCall = (state: State): void => {
  const [batch] = pendingBatches(recorded(), state.acked, batchSize);
  if (batch === undefined) {
    return;
  }
  const text = JSON.stringify(batch.events);
  if (text.length <= keepaliveLimit) {
    uploadLast(ticketOf(state, batch), text);
  }
};

const startIntake = async (): Promise<void> => {
  await openLog();
  const state: State = {
    acked: readAcked(),
    busy: false,
    failures: 0,
    forgotten: new Set(),
    site: siteVersion(),
  };
  track('session.started', { data: environment(state.site) });
  watchPage();
  void startReplay(state.site);
  void noteFingerprint();
  setTimeout(() => {
    void drain(state);
  }, firstDelay);
  setInterval(() => {
    void drain(state);
  }, period);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastCall(state);
    }
  });
};

export { startIntake };
