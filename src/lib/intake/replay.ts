import { guard, report } from '@/lib/fault/fault';
import { actorId, sessionId } from '@/lib/identity/actor';
import { track } from '@/lib/record/current';

import { isOverfull } from './backlog';
import { byteLength } from './plan';
import {
  bodyLimit,
  keepaliveLimit,
  pack,
  post,
  uploadLast,
  type Packed,
  type Ticket,
} from './send';

interface Tape {
  busy: boolean;
  chunk: number;
  frames: Array<unknown>;
  readonly site: string;
}

const period = 15_000;
const half = 2;
const sampling = { input: 'last', mousemove: 200, scroll: 200 } as const;

const ticketFor = (tape: Tape): Ticket => ({
  actor: actorId(),
  kind: 'replay',
  seq: tape.chunk,
  session: sessionId(),
  site: tape.site,
});

const sendWhole = async (
  tape: Tape,
  frames: ReadonlyArray<unknown>,
  packed: Packed,
): Promise<ReadonlyArray<unknown>> => {
  if (await post(ticketFor(tape), packed)) {
    tape.chunk += 1;
    return [];
  }
  return frames;
};

type Sender = (tape: Tape, frames: ReadonlyArray<unknown>) => Promise<ReadonlyArray<unknown>>;

const sendHalves: Sender = async (tape, frames) => {
  const middle = Math.ceil(frames.length / half);
  const unsent = await sendFrames(tape, frames.slice(0, middle));
  if (unsent.length > 0) {
    return [...unsent, ...frames.slice(middle)];
  }
  return sendFrames(tape, frames.slice(middle));
};

const sendFrames = async (
  tape: Tape,
  frames: ReadonlyArray<unknown>,
): Promise<ReadonlyArray<unknown>> => {
  const packed = await pack(JSON.stringify(frames));
  if (packed.body.byteLength <= bodyLimit) {
    return sendWhole(tape, frames, packed);
  }
  if (frames.length === 1) {
    track('replay.dropped', { data: { bytes: packed.body.byteLength, reason: 'oversize' } });
    return [];
  }
  return sendHalves(tape, frames);
};

const flush = async (tape: Tape): Promise<void> => {
  if (tape.busy || tape.frames.length === 0) {
    return;
  }
  tape.busy = true;
  const { frames } = tape;
  tape.frames = [];
  try {
    tape.frames = [...(await sendFrames(tape, frames)), ...tape.frames];
  } catch {
    tape.frames = [...frames, ...tape.frames];
  } finally {
    tape.busy = false;
  }
};

const lastFrames = (tape: Tape): void => {
  if (tape.busy || tape.frames.length === 0) {
    return;
  }
  const text = JSON.stringify(tape.frames);
  if (byteLength(text) <= keepaliveLimit && uploadLast(ticketFor(tape), text)) {
    tape.frames = [];
    tape.chunk += 1;
  }
};

const keep = (tape: Tape, frame: unknown, startOver: () => void): void => {
  tape.frames.push(frame);
  if (isOverfull(tape.frames.length, tape.busy)) {
    track('replay.dropped', { data: { frames: tape.frames.length, reason: 'backlog' } });
    tape.frames = [];
    startOver();
  }
};

const record = async (site: string): Promise<void> => {
  const { record: recorder } = await import('@rrweb/record');
  const tape: Tape = { busy: false, chunk: 0, frames: [], site };
  recorder({
    emit: (frame) => {
      keep(tape, frame, () => {
        recorder.takeFullSnapshot(true);
      });
    },
    sampling,
  });
  setInterval(() => {
    guard('replay.flush', flush(tape));
  }, period);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastFrames(tape);
    }
  });
};

const startReplay = async (site: string): Promise<void> => {
  try {
    await record(site);
  } catch (error) {
    report('replay', 'start', error);
  }
};

export { startReplay };
