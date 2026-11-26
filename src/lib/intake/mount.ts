import { guard, onFault, report } from '@/lib/fault/fault';
import { keptKindsNow } from '@/lib/learner/engine';
import { forgetRecorded, openLog, recorded, track } from '@/lib/record/current';

import { siteVersion } from './environment';
import { observePage } from './observe';
import { acknowledge, pendingBatches, settled, type Acked, type Batch } from './pending';
import { fitBytes, free, holdAfter, isDue, isHeld, prefixBatch, timing, type Hold } from './plan';
import { stored, upload, uploadNow, type Answer, type Ticket } from './send';
import { beginSession } from './session';
import { readAcked, readHold, writeAcked, writeHold } from './stored';

interface State {
  acked: Acked;
  busy: boolean;
  readonly forgotten: Set<string>;
  hold: Hold;
  readonly site: string;
  wanted: boolean;
}

const checkEvery = 15_000;

const siteOf = (state: State, batch: Batch): string => {
  const atTheTime = batch.events[0]?.site ?? '';
  if (atTheTime === '') {
    return state.site;
  }
  return atTheTime;
};

const ticketOf = (state: State, batch: Batch): Ticket => ({
  actor: batch.actor,
  kind: 'events',
  seq: batch.seq,
  session: batch.session,
  site: siteOf(state, batch),
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
  writeHold(hold);
};

const accept = (state: State, batch: Batch): void => {
  state.acked = acknowledge(state.acked, batch);
  writeAcked(state.acked);
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
  report(
    'intake.refused',
    String(answer.status),
    new Error(`retry after ${String(state.hold.until - now)} ms`),
  );
  return false;
};

const sendAll = async (state: State, batches: ReadonlyArray<Batch>): Promise<void> => {
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
  const kept = keptKindsNow();
  if (kept === null) {
    return;
  }
  const ids = settled(recorded(), state.acked, kept).filter((id) => !state.forgotten.has(id));
  for (const id of ids) {
    state.forgotten.add(id);
  }
  if (ids.length > 0) {
    forgetRecorded(ids);
  }
};

const pending = (state: State): Array<Batch> =>
  pendingBatches(recorded(), state.acked, timing.batchSize);

const sendDue = async (state: State): Promise<void> => {
  const batches = pending(state);
  if (isHeld(state.hold, Date.now()) || !isDue(batches, Date.now())) {
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

const drain = async (state: State): Promise<void> => {
  if (state.busy) {
    state.wanted = true;
    return;
  }
  await sendDue(state);
  if (state.wanted) {
    state.wanted = false;
    await drain(state);
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
  if (state.wanted) {
    state.wanted = false;
    await drain(state);
  }
};

const lastCall = (state: State): void => {
  const [batch] = pending(state);
  if (batch === undefined || state.busy || isHeld(state.hold, Date.now())) {
    return;
  }
  const part = prefixBatch(batch, fitBytes(batch.events));
  if (part !== null) {
    guard('intake.last', sendLast(state, part));
  }
};

const keepSending = (state: State): void => {
  setInterval(() => {
    guard('intake.drain', drain(state));
  }, checkEvery);
  onFault(() => {
    setTimeout(() => {
      guard('intake.drain', drain(state));
    }, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastCall(state);
    }
  });
  globalThis.addEventListener('pagehide', () => {
    lastCall(state);
  });
};

const startIntake = async (): Promise<void> => {
  await openLog();
  const state: State = {
    acked: readAcked(),
    busy: false,
    forgotten: new Set(),
    hold: readHold(),
    site: siteVersion(),
    wanted: false,
  };
  beginSession();
  observePage(state.site);
  keepSending(state);
};

export { startIntake };
