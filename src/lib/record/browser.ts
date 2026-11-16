import { readEvents, type LearningEvent } from './event';
import { memoryPersistence, type Persistence } from './log';

interface Storage {
  readonly durable: boolean;
  readonly persistence: Persistence;
  readonly reason: string;
}

const databaseName = 'konekode';
const storeName = 'events';
const schemaVersion = 1;
const legacyKey = 'cp:events:v1';

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

const openDatabase = async (): Promise<IDBDatabase> => {
  const opening = indexedDB.open(databaseName, schemaVersion);
  opening.addEventListener('upgradeneeded', () => {
    opening.result.createObjectStore(storeName, { keyPath: 'id' });
  });
  const database = await settle(opening);
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
  const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
  await Promise.all(events.map((event) => settle(store.put(event))));
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
    append: async (event) => {
      await putAll(database, [event]);
    },
    load: async () => {
      const store = database.transaction(storeName, 'readonly').objectStore(storeName);
      const all: unknown[] = await settle(store.getAll());
      return all;
    },
    remove: async (ids) => {
      const store = database.transaction(storeName, 'readwrite').objectStore(storeName);
      await Promise.all(ids.map((id) => settle(store.delete(id))));
    },
  };
};

const browserPersistence = async (): Promise<Storage> => {
  try {
    return { durable: true, persistence: await databasePersistence(), reason: '' };
  } catch (error) {
    return { durable: false, persistence: memoryPersistence(readLegacy()), reason: String(error) };
  }
};

export { browserPersistence, databaseName, storeName };
