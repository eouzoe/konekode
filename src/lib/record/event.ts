import {
  boolean,
  int,
  literal,
  number,
  object,
  record,
  string,
  union,
  type infer as Infer,
} from '@/lib/zod';

const currentVersion = 3;
const faultKind = 'fault';
const faultSummaryKind = 'fault.summary';
const unlabelledVersion = 2;
const legacyVersion = 1;
const legacySession = 'legacy';
const unknownContent = '';

const valueSchema = union([boolean(), number(), string()]);
const dataSchema = record(string(), valueSchema);
const moment = int();
const name = string().min(1);

const shared = {
  actor: string(),
  at: moment,
  data: dataSchema,
  id: name,
  kind: name,
  ref: string(),
  seq: moment,
  session: string(),
  unit: string(),
};

const eventSchema = object({
  ...shared,
  content: string(),
  site: string(),
  version: literal(currentVersion),
});

const unlabelledSchema = object({ ...shared, version: literal(unlabelledVersion) });

const legacySchema = object({
  at: moment,
  device: string(),
  id: name,
  kind: name,
  ref: string(),
  unit: string(),
  version: literal(legacyVersion),
});

type LearningEvent = Infer<typeof eventSchema>;
type Data = Infer<typeof dataSchema>;

const label = (event: Infer<typeof unlabelledSchema>): LearningEvent => ({
  ...event,
  content: unknownContent,
  site: unknownContent,
  version: currentVersion,
});

const upgrade = (old: Infer<typeof legacySchema>): LearningEvent =>
  label({
    actor: old.device,
    at: old.at,
    data: {},
    id: old.id,
    kind: old.kind,
    ref: old.ref,
    seq: 0,
    session: legacySession,
    unit: old.unit,
    version: unlabelledVersion,
  });

const readEvent = (value: unknown): LearningEvent | null => {
  const current = eventSchema.safeParse(value);
  if (current.success) {
    return current.data;
  }
  const unlabelled = unlabelledSchema.safeParse(value);
  if (unlabelled.success) {
    return label(unlabelled.data);
  }
  const legacy = legacySchema.safeParse(value);
  if (legacy.success) {
    return upgrade(legacy.data);
  }
  return null;
};

interface Reading {
  readonly events: Array<LearningEvent>;
  readonly unlabelled: number;
  readonly unreadable: number;
}

const readCounted = (values: ReadonlyArray<unknown>): Reading => {
  const events: Array<LearningEvent> = [];
  let unreadable = 0;
  for (const value of values) {
    const event = readEvent(value);
    if (event === null) {
      unreadable += 1;
    } else {
      events.push(event);
    }
  }
  const unlabelled = events.filter((event) => event.content === unknownContent).length;
  return { events, unlabelled, unreadable };
};

const readEvents = (values: ReadonlyArray<unknown>): Array<LearningEvent> =>
  readCounted(values).events;

const byTime = (left: LearningEvent, right: LearningEvent): number => {
  if (left.at !== right.at) {
    return left.at - right.at;
  }
  if (left.session === right.session && left.seq !== right.seq) {
    return left.seq - right.seq;
  }
  return left.id.localeCompare(right.id);
};

const ordered = (events: ReadonlyArray<LearningEvent>): Array<LearningEvent> =>
  [...new Map(events.map((event) => [event.id, event])).values()].toSorted(byTime);

export {
  currentVersion,
  faultKind,
  faultSummaryKind,
  ordered,
  readCounted,
  readEvent,
  readEvents,
  unknownContent,
  type Data,
  type LearningEvent,
  type Reading,
};
