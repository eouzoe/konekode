import { type LearningEvent } from '@/lib/record/event';

interface Batch {
  readonly actor: string;
  readonly events: readonly LearningEvent[];
  readonly last: number;
  readonly seq: number;
  readonly session: string;
}

type Acked = Readonly<Record<string, number>>;

const fromEnd = -1;
const identifier = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;

const sendable = (event: LearningEvent): boolean =>
  identifier.test(event.session) && identifier.test(event.actor);

const uploadable = (event: LearningEvent, acked: Acked): boolean =>
  sendable(event) && event.seq > (acked[event.session] ?? 0);

const slices = (events: readonly LearningEvent[], size: number): LearningEvent[][] => {
  const parts: LearningEvent[][] = [];
  for (let start = 0; start < events.length; start += size) {
    parts.push(events.slice(start, start + size));
  }
  return parts;
};

const toBatch = (events: readonly LearningEvent[]): Batch[] => {
  const [first] = events;
  const final = events.at(fromEnd);
  if (first === undefined || final === undefined) {
    return [];
  }
  return [{ actor: first.actor, events, last: final.seq, seq: first.seq, session: first.session }];
};

const pendingBatches = (events: readonly LearningEvent[], acked: Acked, size: number): Batch[] => {
  const bySession = new Map<string, LearningEvent[]>();
  for (const event of events) {
    if (uploadable(event, acked)) {
      bySession.set(event.session, [...(bySession.get(event.session) ?? []), event]);
    }
  }
  return [...bySession.values()].flatMap((group) =>
    slices(
      group.toSorted((left, right) => left.seq - right.seq),
      size,
    ).flatMap((part) => toBatch(part)),
  );
};

const acknowledge = (acked: Acked, batch: Batch): Acked => ({
  ...acked,
  [batch.session]: Math.max(acked[batch.session] ?? 0, batch.last),
});

const settled = (
  events: readonly LearningEvent[],
  acked: Acked,
  kept: ReadonlySet<string>,
): string[] =>
  events
    .filter((event) => !kept.has(event.kind) && sendable(event) && !uploadable(event, acked))
    .map((event) => event.id);

export { acknowledge, pendingBatches, settled, type Acked, type Batch };
