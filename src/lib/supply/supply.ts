import { overdue, timeToStart, type Due, type Link, type Step } from './plan';

type Loader = () => Promise<unknown>;
type Status = 'failed' | 'loading' | 'ready' | 'waiting';

const retryMs = 3000;
const untilLimitMs = 10_000;

interface Options {
  readonly dues: readonly Due[];
  readonly link: () => Link;
  readonly loaders: Readonly<Record<string, Loader>>;
  readonly onFailure: (name: string, error: unknown) => void;
  readonly onSettle: () => void;
  readonly online: () => boolean;
  readonly steps: readonly Step[];
}

interface Supply {
  readonly advance: (at: number) => void;
  readonly missing: (at: number) => string[];
  readonly resume: () => void;
  readonly until: (at: number) => Promise<void>;
}

interface State {
  at: number;
  readonly options: Options;
  readonly status: Map<string, Status>;
  readonly waiters: Set<() => void>;
}

const statusOf = (state: State, name: string): Status => state.status.get(name) ?? 'waiting';

const known = (state: State): Due[] =>
  state.options.dues.filter((due) => state.options.loaders[due.name] !== undefined);

const open = (state: State, retry: boolean): Due[] =>
  known(state).filter((due) => {
    const status = statusOf(state, due.name);
    return status === 'waiting' || (retry && status === 'failed');
  });

const busy = (state: State): boolean =>
  known(state).some((due) => statusOf(state, due.name) === 'loading');

const wanted = (state: State, left: readonly Due[]): boolean => {
  if (!state.options.online()) {
    return left.some((due) => due.by <= state.at);
  }
  const link = state.options.link();
  return left.some((due) => timeToStart({ at: state.at, due, link, steps: state.options.steps }));
};

const pump = (state: State, retry: boolean): void => {
  if (busy(state)) {
    return;
  }
  const left = open(state, retry);
  const [next] = left;
  if (next === undefined || !wanted(state, left)) {
    return;
  }
  const loader = state.options.loaders[next.name];
  if (loader !== undefined) {
    void load(state, next, loader);
  }
};

const load = async (state: State, due: Due, loader: Loader): Promise<void> => {
  state.status.set(due.name, 'loading');
  try {
    await loader();
    state.status.set(due.name, 'ready');
  } catch (error) {
    state.status.set(due.name, 'failed');
    if (state.options.online()) {
      state.options.onFailure(due.name, error);
    }
    setTimeout(() => {
      pump(state, true);
    }, retryMs);
  }
  settled(state);
};

const settled = (state: State): void => {
  for (const waiter of state.waiters) {
    waiter();
  }
  state.options.onSettle();
  pump(state, false);
};

const missingAt = (state: State, at: number): string[] =>
  overdue(state.options.dues, at)
    .filter((due) => statusOf(state, due.name) !== 'ready')
    .map((due) => due.name);

const until = async (state: State, at: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  const check = (): void => {
    if (missingAt(state, at).length === 0) {
      resolve(null);
    }
  };
  state.waiters.add(check);
  const timer = setTimeout(() => {
    resolve(null);
  }, untilLimitMs);
  check();
  await promise;
  state.waiters.delete(check);
  clearTimeout(timer);
};

const createSupply = (options: Options): Supply => {
  const state: State = { at: 0, options, status: new Map(), waiters: new Set() };
  const advance = (at: number): void => {
    state.at = at;
    pump(state, true);
  };
  return {
    advance,
    missing: (at) => missingAt(state, at),
    resume: () => {
      pump(state, true);
    },
    until: async (at) => {
      advance(at);
      await until(state, at);
    },
  };
};

export { createSupply, type Loader, type Supply };
