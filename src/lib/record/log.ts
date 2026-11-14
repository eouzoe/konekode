import { currentVersion, readEvents, type Data, type LearningEvent } from './event';

interface Persistence {
  readonly append: (event: LearningEvent) => Promise<void>;
  readonly load: () => Promise<unknown[]>;
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
  readonly subscribe: (listener: (event: LearningEvent) => void) => void;
  readonly track: (kind: string, entry?: Entry) => LearningEvent;
}

interface State {
  readonly events: LearningEvent[];
  readonly listeners: ((event: LearningEvent) => void)[];
  pending: Promise<void>;
  seq: number;
}

const memoryPersistence = (initial: readonly unknown[] = []): Persistence => {
  const stored: unknown[] = [...initial];
  return {
    append: async (event) => {
      stored.push(event);
      await Promise.resolve();
    },
    load: () => Promise.resolve([...stored]),
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

const persist = ({ source, state }: Context, event: LearningEvent): void => {
  const previous = state.pending;
  state.pending = (async (): Promise<void> => {
    await previous;
    try {
      await source.persistence.append(event);
    } catch {
      await Promise.resolve();
    }
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
    subscribe: (listener) => {
      state.listeners.push(listener);
    },
    track: (kind, entry = {}) => {
      const event = build({ source, state }, kind, entry);
      state.events.push(event);
      persist({ source, state }, event);
      for (const listener of state.listeners) {
        listener(event);
      }
      return event;
    },
  };
};

export { createLog, memoryPersistence, type Entry, type Log, type Persistence, type Source };
