import { adopt } from './adopt';
import { readEvents, type LearningEvent } from './event';
import { memoryPersistence, type Persistence } from './log';

type Trouble = '' | 'blocked' | 'stalled' | 'unavailable';

interface Storage {
  readonly later: Promise<number> | null;
  readonly persistence: Persistence;
  readonly reason: unknown;
  readonly took: number;
  readonly trouble: Trouble;
}

const databaseName = 'konekode';
const storeName = 'events';
const schemaVersion = 1;
const legacyKey = 'cp:events:v1';
const blockedWait = 3000;
const stallWait = 6000;
const slowAfter = 2000;
const relaxed: IDBTransactionOptions = { durability: 'relaxed' };

class BlockedOpenError extends Error {
  override readonly name = 'BlockedOpenError';
}

const settle = <Result>(pending: IDBRequest<Result>): Promise<Result> => {
  const { promise, reject, resolve } = Promise.withResolvers<Result>();
  pending.addEventListener('success', () => {
    resolve(pending.result);
  });
  pending.addEventListener('error', () => {
    reject(pending.error ?? new Error('瀏覽器的資料庫沒有回應'));
  });
  return promise;
};

const committed = async (transaction: IDBTransaction): Promise<void> => {
  const { promise, reject, resolve } = Promise.withResolvers<null>();
  transaction.addEventListener('complete', () => {
    resolve(null);
  });
  const fail = (): void => {
    reject(transaction.error ?? new Error('瀏覽器的資料庫放棄了這次寫入'));
  };
  transaction.addEventListener('abort', fail);
  transaction.addEventListener('error', fail);
  await promise;
};

const closeWhenOpened = (opening: IDBOpenDBRequest): void => {
  opening.addEventListener('success', () => {
    opening.result.close();
  });
};

const unblocked = (opening: IDBOpenDBRequest): Promise<never> => {
  const { promise, reject } = Promise.withResolvers<never>();
  opening.addEventListener('blocked', () => {
    setTimeout(() => {
      closeWhenOpened(opening);
      reject(new BlockedOpenError('另一個分頁占著舊版的資料庫'));
    }, blockedWait);
  });
  return promise;
};

const deadline = (): Promise<null> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, stallWait);
  return promise;
};

const openDatabase = async (): Promise<IDBDatabase> => {
  const opening = indexedDB.open(databaseName, schemaVersion);
  opening.addEventListener('upgradeneeded', () => {
    if (!opening.result.objectStoreNames.contains(storeName)) {
      opening.result.createObjectStore(storeName, { keyPath: 'id' });
    }
  });
  const database = await Promise.race([settle(opening), unblocked(opening)]);
  database.addEventListener('versionchange', () => {
    database.close();
  });
  return database;
};

const readLegacy = (): Array<LearningEvent> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(legacyKey) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return readEvents(parsed);
  } catch {
    return [];
  }
};

const dropLegacy = (): void => {
  try {
    localStorage.removeItem(legacyKey);
  } catch {
    readLegacy();
  }
};

const putAll = async (
  database: IDBDatabase,
  events: ReadonlyArray<LearningEvent>,
): Promise<void> => {
  const transaction = database.transaction(storeName, 'readwrite', relaxed);
  const store = transaction.objectStore(storeName);
  for (const event of events) {
    store.put(event);
  }
  await committed(transaction);
};

const importLegacy = async (database: IDBDatabase): Promise<void> => {
  const legacy = readLegacy();
  if (legacy.length > 0) {
    await putAll(database, legacy);
  }
  dropLegacy();
};

const databasePersistence = async (): Promise<Persistence> => {
  const database = await openDatabase();
  await importLegacy(database);
  return {
    append: async (events) => {
      await putAll(database, events);
    },
    load: async () => {
      const store = database.transaction(storeName, 'readonly').objectStore(storeName);
      const all: Array<unknown> = await settle(store.getAll());
      return all;
    },
    remove: async (ids) => {
      const transaction = database.transaction(storeName, 'readwrite', relaxed);
      const store = transaction.objectStore(storeName);
      for (const id of ids) {
        store.delete(id);
      }
      await committed(transaction);
    },
  };
};

const troubleOf = (error: unknown): Trouble => {
  if (error instanceof BlockedOpenError) {
    return 'blocked';
  }
  return 'unavailable';
};

const meanwhile = (opening: Promise<Persistence>, began: number): Storage => {
  const adoption = adopt(memoryPersistence(readLegacy()), opening, began);
  return {
    later: adoption.done,
    persistence: adoption.persistence,
    reason: new Error(`瀏覽器的資料庫 ${String(stallWait)} 毫秒還沒有打開`),
    took: performance.now() - began,
    trouble: 'stalled',
  };
};

const browserPersistence = async (): Promise<Storage> => {
  const began = performance.now();
  const opening = databasePersistence();
  try {
    const first = await Promise.race([opening, deadline()]);
    if (first === null) {
      return meanwhile(opening, began);
    }
    return {
      later: null,
      persistence: first,
      reason: null,
      took: performance.now() - began,
      trouble: '',
    };
  } catch (error) {
    return {
      later: null,
      persistence: memoryPersistence(readLegacy()),
      reason: error,
      took: performance.now() - began,
      trouble: troubleOf(error),
    };
  }
};

export {
  blockedWait,
  browserPersistence,
  databaseName,
  schemaVersion,
  slowAfter,
  stallWait,
  storeName,
  type Storage,
  type Trouble,
};
