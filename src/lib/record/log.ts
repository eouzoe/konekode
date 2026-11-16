import { currentVersion, readEvents, type Data, type LearningEvent } from './event';

interface Persistence {
  readonly append: (event: LearningEvent) => Promise<void>;
  readonly load: () => Promise<unknown[]>;
  readonly remove: (ids: readonly string[]) => Promise<void>;
}

interface Entry {
  readonly data?: Data;
  readonly ref?: string;
  readonly unit?: string;
}

interface Source {
  readonly actor: string;
  readonly newId: () => string;
  readonly now: () => number;
  readonly persistence: Persistence;
  readonly session: string;
}

interface Log {
  readonly events: () => readonly LearningEvent[];
  readonly flush: () => Promise<void>;
  readonly forget: (ids: readonly string[]) => void;
  readonly subscribe: (listener: (event: LearningEvent) => void) => void;
  readonly track: (kind: string, entry?: Entry) => LearningEvent;
}

interface State {
  readonly events: LearningEvent[];
  readonly listeners: ((event: LearningEvent) => void)[];
  pending: Promise<void>;
  seq: number;
}

const hasId = (value: unknown, ids: ReadonlySet<string>): boolean =>
  typeof value === 'object' && value !== null && 'id' in value && ids.has(String(value.id));

const memoryPersistence = (initial: readonly unknown[] = []): Persistence => {
  let stored: unknown[] = [...initial];
  return {
    append: async (event) => {
      stored.push(event);
      await Promise.resolve();
    },
    load: () => Promise.resolve([...stored]),
    remove: async (ids) => {
      const gone = new Set(ids);
      stored = stored.filter((value) => !hasId(value, gone));
      await Promise.resolve();
    },
  };
};

interface Context {
  readonly source: Source;
  readonly state: State;
}

const build = ({ source, state }: Context, kind: string, entry: Entry): LearningEvent => {
  state.seq += 1;
  return {
    actor: source.actor,
    at: source.now(),
    data: entry.data ?? {},
    id: source.newId(),
    kind,
    ref: entry.ref ?? '',
    seq: state.seq,
    session: source.session,
    unit: entry.unit ?? '',
    version: currentVersion,
  };
};

const attempt = async (work: () => Promise<void>): Promise<void> => {
  try {
    await work();
  } catch {
    await Promise.resolve();
  }
};

const queue = (state: State, work: () => Promise<void>): void => {
  const previous = state.pending;
  const done = attempt(work);
  state.pending = (async (): Promise<void> => {
    await previous;
    await done;
  })();
};

const createLog = async (source: Source): Promise<Log> => {
  const state: State = {
    events: readEvents(await source.persistence.load()),
    listeners: [],
    pending: Promise.resolve(),
    seq: 0,
  };
  return {
    events: () => state.events,
    flush: async () => {
      await state.pending;
    },
    forget: (ids) => {
      queue(state, () => source.persistence.remove(ids));
    },
    subscribe: (listener) => {
      state.listeners.push(listener);
    },
    track: (kind, entry = {}) => {
      const event = build({ source, state }, kind, entry);
      state.events.push(event);
      queue(state, () => source.persistence.append(event));
      for (const listener of state.listeners) {
        listener(event);
      }
      return event;
    },
  };
};

export { createLog, memoryPersistence, type Entry, type Log, type Persistence, type Source };
