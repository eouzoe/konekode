import { actorId, sessionId } from '@/lib/identity/actor';
import { track } from '@/lib/record/current';

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
  frames: unknown[];
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
  frames: readonly unknown[],
  packed: Packed,
): Promise<readonly unknown[]> => {
  if (await post(ticketFor(tape), packed)) {
    tape.chunk += 1;
    return [];
  }
  return frames;
};

type Sender = (tape: Tape, frames: readonly unknown[]) => Promise<readonly unknown[]>;

const sendHalves: Sender = async (tape, frames) => {
  const middle = Math.ceil(frames.length / half);
  const unsent = await sendFrames(tape, frames.slice(0, middle));
  if (unsent.length > 0) {
    return [...unsent, ...frames.slice(middle)];
  }
  return sendFrames(tape, frames.slice(middle));
};

const sendFrames = async (tape: Tape, frames: readonly unknown[]): Promise<readonly unknown[]> => {
  const packed = await pack(JSON.stringify(frames));
  if (packed.body.size <= bodyLimit) {
    return sendWhole(tape, frames, packed);
  }
  if (frames.length === 1) {
    track('replay.dropped', { data: { bytes: packed.body.size } });
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
  if (text.length <= keepaliveLimit && uploadLast(ticketFor(tape), text)) {
    tape.frames = [];
    tape.chunk += 1;
  }
};

const startReplay = async (site: string): Promise<void> => {
  const { record } = await import('@rrweb/record');
  const tape: Tape = { busy: false, chunk: 0, frames: [], site };
  record({
    emit: (frame) => {
      tape.frames.push(frame);
    },
    sampling,
  });
  setInterval(() => {
    void flush(tape);
  }, period);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastFrames(tape);
    }
  });
};

export { startReplay };
