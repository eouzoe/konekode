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
} from 'zod';

const currentVersion = 2;
const legacyVersion = 1;
const legacySession = 'legacy';

const valueSchema = union([boolean(), number(), string()]);
const dataSchema = record(string(), valueSchema);
const moment = int();
const name = string().min(1);

const eventSchema = object({
  actor: string(),
  at: moment,
  data: dataSchema,
  id: name,
  kind: name,
  ref: string(),
  seq: moment,
  session: string(),
  unit: string(),
  version: literal(currentVersion),
});

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

const upgrade = (old: Infer<typeof legacySchema>): LearningEvent => ({
  actor: old.device,
  at: old.at,
  data: {},
  id: old.id,
  kind: old.kind,
  ref: old.ref,
  seq: 0,
  session: legacySession,
  unit: old.unit,
  version: currentVersion,
});

const readEvent = (value: unknown): LearningEvent | null => {
  const current = eventSchema.safeParse(value);
  if (current.success) {
    return current.data;
  }
  const legacy = legacySchema.safeParse(value);
  if (legacy.success) {
    return upgrade(legacy.data);
  }
  return null;
};

const readEvents = (values: readonly unknown[]): LearningEvent[] =>
  values.map((value) => readEvent(value)).filter((event) => event !== null);

const byTime = (left: LearningEvent, right: LearningEvent): number => {
  if (left.at !== right.at) {
    return left.at - right.at;
  }
  if (left.session === right.session && left.seq !== right.seq) {
    return left.seq - right.seq;
  }
  return left.id.localeCompare(right.id);
};

const ordered = (events: readonly LearningEvent[]): LearningEvent[] =>
  [...new Map(events.map((event) => [event.id, event])).values()].toSorted(byTime);

export { currentVersion, ordered, readEvent, readEvents, type Data, type LearningEvent };
