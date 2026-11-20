import { readEvents } from './event';
import { type Persistence } from './log';

interface Adoption {
  readonly done: Promise<number>;
  readonly persistence: Persistence;
}

const adopt = (memory: Persistence, later: Promise<Persistence>, began: number): Adoption => {
  let target = memory;
  const done = (async (): Promise<number> => {
    const store = await later;
    target = store;
    await store.append(readEvents(await memory.load()));
    return performance.now() - began;
  })();
  return {
    done,
    persistence: {
      append: async (events) => {
        await target.append(events);
      },
      load: () => target.load(),
      remove: async (ids) => {
        await target.remove(ids);
      },
    },
  };
};

export { adopt, type Adoption };
