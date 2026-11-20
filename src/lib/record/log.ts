import { currentVersion, readCounted, type Data, type LearningEvent } from './event';

interface Persistence {
  readonly append: (events: readonly LearningEvent[]) => Promise<void>;
  readonly load: () => Promise<unknown[]>;
  readonly remove: (ids: readonly string[]) => Promise<void>;
}

interface Entry {
  readonly at?: number;
  readonly data?: Data;
  readonly ref?: string;
  readonly unit?: string;
}

interface StoreFault {
  readonly error: unknown;
  readonly kind: 'dropped' | 'remove' | 'write';
  readonly size: number;
}

interface Source {
  readonly actor: string;
  readonly content: string;
  readonly newId: () => string;
  readonly now: () => number;
  readonly onFault?: (fault: StoreFault) => void;
  readonly persistence: Persistence;
  readonly retryDelay?: (attempt: number) => number;
  readonly session: string;
  readonly site: string;
}

interface Loaded {
  readonly unlabelled: number;
  readonly unreadable: number;
}

interface Log {
  readonly dropped: () => number;
  readonly events: () => readonly LearningEvent[];
  readonly flush: () => Promise<void>;
  readonly forget: (ids: readonly string[]) => void;
  readonly loaded: Loaded;
  readonly subscribe: (listener: (event: LearningEvent) => void) => void;
  readonly track: (kind: string, entry?: Entry) => LearningEvent;
}

interface State {
  abandoned: boolean;
  dropped: number;
  readonly events: LearningEvent[];
  failures: number;
  latest: number;
  readonly listeners: ((event: LearningEvent) => void)[];
  pending: Promise<void>;
  saving: Promise<void>;
  seq: number;
  readonly unsaved: LearningEvent[];
  waiting: boolean;
}

const retryLimit = 4;
const firstRetry = 1000;
const doubling = 2;

const hasId = (value: unknown, ids: ReadonlySet<string>): boolean =>
  typeof value === 'object' && value !== null && 'id' in value && ids.has(String(value.id));

const memoryPersistence = (initial: readonly unknown[] = []): Persistence => {
  let stored: unknown[] = [...initial];
  return {
    append: async (events) => {
      stored.push(...events);
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

const latestOf = (events: readonly LearningEvent[]): number => {
  let latest = 0;
  for (const event of events) {
    latest = Math.max(latest, event.at);
  }
  return latest;
};

const build = ({ source, state }: Context, kind: string, entry: Entry): LearningEvent => {
  state.seq += 1;
  state.latest = Math.max(entry.at ?? source.now(), state.latest + 1);
  return {
    actor: source.actor,
    at: state.latest,
    content: source.content,
    data: entry.data ?? {},
    id: source.newId(),
    kind,
    ref: entry.ref ?? '',
    seq: state.seq,
    session: source.session,
    site: source.site,
    unit: entry.unit ?? '',
    version: currentVersion,
  };
};

const delayOf = (source: Source, attempt: number): number =>
  source.retryDelay?.(attempt) ?? firstRetry * doubling ** (attempt - 1);

const queue = ({ source, state }: Context, work: () => Promise<void>): void => {
  const previous = state.pending;
  const done = (async (): Promise<void> => {
    try {
      await work();
    } catch (error) {
      source.onFault?.({ error, kind: 'remove', size: 0 });
    }
  })();
  state.pending = (async (): Promise<void> => {
    await previous;
    await done;
  })();
};

interface Failure {
  readonly batch: readonly LearningEvent[];
  readonly error: unknown;
}

const retryLater = (context: Context, again: () => void): void => {
  context.state.waiting = true;
  setTimeout(
    () => {
      context.state.waiting = false;
      again();
    },
    delayOf(context.source, context.state.failures),
  );
};

const giveUp = ({ source, state }: Context, { batch, error }: Failure): void => {
  state.abandoned = true;
  state.dropped += batch.length;
  source.onFault?.({ error, kind: 'dropped', size: batch.length });
};

const failed = (context: Context, failure: Failure, again: () => void): void => {
  const { source, state } = context;
  state.failures += 1;
  if (state.failures > retryLimit) {
    giveUp(context, failure);
    return;
  }
  state.unsaved.unshift(...failure.batch);
  source.onFault?.({ error: failure.error, kind: 'write', size: failure.batch.length });
  retryLater(context, again);
};

const persist = async (
  context: Context,
  batch: readonly LearningEvent[],
  again: () => void,
): Promise<void> => {
  try {
    await context.source.persistence.append(batch);
    context.state.failures = 0;
  } catch (error) {
    failed(context, { batch, error }, again);
  }
};

const save = async (context: Context, again: () => void): Promise<void> => {
  const { state } = context;
  const batch = state.unsaved.splice(0);
  if (batch.length === 0) {
    return;
  }
  if (state.abandoned) {
    state.dropped += batch.length;
    return;
  }
  await persist(context, batch, again);
};

const saveLater = (context: Context): void => {
  const previous = context.state.saving;
  context.state.saving = (async (): Promise<void> => {
    await previous;
    await save(context, () => {
      saveLater(context);
    });
  })();
};

const removeLater = (context: Context, ids: readonly string[]): void => {
  const written = context.state.saving;
  queue(context, async () => {
    await written;
    await context.source.persistence.remove(ids);
  });
};

const freshState = (events: LearningEvent[]): State => ({
  abandoned: false,
  dropped: 0,
  events,
  failures: 0,
  latest: latestOf(events),
  listeners: [],
  pending: Promise.resolve(),
  saving: Promise.resolve(),
  seq: 0,
  unsaved: [],
  waiting: false,
});

const createLog = async (source: Source): Promise<Log> => {
  const { events, unlabelled, unreadable } = readCounted(await source.persistence.load());
  const state = freshState(events);
  return {
    dropped: () => state.dropped,
    events: () => state.events,
    flush: async () => {
      await state.saving;
      await state.pending;
    },
    forget: (ids) => {
      removeLater({ source, state }, ids);
    },
    loaded: { unlabelled, unreadable },
    subscribe: (listener) => {
      state.listeners.push(listener);
    },
    track: (kind, entry = {}) => {
      const event = build({ source, state }, kind, entry);
      state.events.push(event);
      state.unsaved.push(event);
      if (!state.waiting) {
        saveLater({ source, state });
      }
      for (const listener of state.listeners) {
        listener(event);
      }
      return event;
    },
  };
};

export {
  createLog,
  memoryPersistence,
  retryLimit,
  type Entry,
  type Loaded,
  type Log,
  type Persistence,
  type Source,
  type StoreFault,
};
