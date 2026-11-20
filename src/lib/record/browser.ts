import { readEvents, type LearningEvent } from './event';
import { memoryPersistence, type Persistence } from './log';

type Trouble = '' | 'blocked' | 'stalled' | 'unavailable';

interface Storage {
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

class OpenTroubleError extends Error {
  override readonly name = 'OpenTroubleError';

  readonly trouble: 'blocked' | 'stalled';

  constructor(trouble: 'blocked' | 'stalled', message: string) {
    super(message);
    this.trouble = trouble;
  }
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
      reject(new OpenTroubleError('blocked', '另一個分頁占著舊版的資料庫'));
    }, blockedWait);
  });
  return promise;
};

const unstalled = (opening: IDBOpenDBRequest): Promise<never> => {
  const { promise, reject } = Promise.withResolvers<never>();
  const timer = setTimeout(() => {
    closeWhenOpened(opening);
    reject(new OpenTroubleError('stalled', `瀏覽器的資料庫 ${String(stallWait)} 毫秒都沒有回應`));
  }, stallWait);
  for (const name of ['success', 'error', 'blocked']) {
    opening.addEventListener(name, () => {
      clearTimeout(timer);
    });
  }
  return promise;
};

const openDatabase = async (): Promise<IDBDatabase> => {
  const opening = indexedDB.open(databaseName, schemaVersion);
  opening.addEventListener('upgradeneeded', () => {
    if (!opening.result.objectStoreNames.contains(storeName)) {
      opening.result.createObjectStore(storeName, { keyPath: 'id' });
    }
  });
  const database = await Promise.race([settle(opening), unblocked(opening), unstalled(opening)]);
  database.addEventListener('versionchange', () => {
    database.close();
  });
  return database;
};

const readLegacy = (): LearningEvent[] => {
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

const putAll = async (database: IDBDatabase, events: readonly LearningEvent[]): Promise<void> => {
  const transaction = database.transaction(storeName, 'readwrite');
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
      const all: unknown[] = await settle(store.getAll());
      return all;
    },
    remove: async (ids) => {
      const transaction = database.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      for (const id of ids) {
        store.delete(id);
      }
      await committed(transaction);
    },
  };
};

const troubleOf = (error: unknown): Trouble => {
  if (error instanceof OpenTroubleError) {
    return error.trouble;
  }
  return 'unavailable';
};

const browserPersistence = async (): Promise<Storage> => {
  const began = performance.now();
  try {
    const persistence = await databasePersistence();
    return { persistence, reason: null, took: performance.now() - began, trouble: '' };
  } catch (error) {
    return {
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
