import { Option, Schema } from 'effect';

const currentVersion = 3;
const faultKind = 'fault';
const faultSummaryKind = 'fault.summary';
const unlabelledVersion = 2;
const legacyVersion = 1;
const legacySession = 'legacy';
const unknownContent = '';

const valueSchema = Schema.Union([Schema.Boolean, Schema.Finite, Schema.String]);
const dataSchema = Schema.Record(Schema.String, valueSchema);
const moment = Schema.Int;
const name = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));

const shared = {
  actor: Schema.String,
  at: moment,
  data: dataSchema,
  id: name,
  kind: name,
  ref: Schema.String,
  seq: moment,
  session: Schema.String,
  unit: Schema.String,
};

const eventSchema = Schema.Struct({
  ...shared,
  content: Schema.String,
  site: Schema.String,
  version: Schema.Literal(currentVersion),
});

const unlabelledSchema = Schema.Struct({ ...shared, version: Schema.Literal(unlabelledVersion) });

const legacySchema = Schema.Struct({
  at: moment,
  device: Schema.String,
  id: name,
  kind: name,
  ref: Schema.String,
  unit: Schema.String,
  version: Schema.Literal(legacyVersion),
});

const decodeCurrent = Schema.decodeUnknownOption(eventSchema);
const decodeUnlabelled = Schema.decodeUnknownOption(unlabelledSchema);
const decodeLegacy = Schema.decodeUnknownOption(legacySchema);

type LearningEvent = typeof eventSchema.Type;
type Data = typeof dataSchema.Type;

const label = (event: typeof unlabelledSchema.Type): LearningEvent => ({
  ...event,
  content: unknownContent,
  site: unknownContent,
  version: currentVersion,
});

const upgrade = (old: typeof legacySchema.Type): LearningEvent =>
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
  const current = decodeCurrent(value);
  if (Option.isSome(current)) {
    return current.value;
  }
  const unlabelled = decodeUnlabelled(value);
  if (Option.isSome(unlabelled)) {
    return label(unlabelled.value);
  }
  return Option.getOrNull(Option.map(decodeLegacy(value), upgrade));
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
