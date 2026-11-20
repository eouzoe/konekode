import { report } from '@/lib/fault/fault';
import { number, object, record, string, type ZodType } from '@/lib/zod';

import { type Acked } from './pending';
import { free, type Hold } from './plan';

const ackedKey = 'cp:intake:acked';
const holdKey = 'cp:intake:hold';
const ackedSchema = record(string(), number());
const holdSchema = object({ failures: number(), until: number() });

const readStored = <Value>(key: string, schema: ZodType<Value>, fallback: Value): Value => {
  try {
    const parsed = schema.safeParse(JSON.parse(localStorage.getItem(key) ?? 'null'));
    if (parsed.success) {
      return parsed.data;
    }
  } catch (error) {
    report('storage.local', key, error);
    return fallback;
  }
  return fallback;
};

const writeStored = (key: string, value: unknown): boolean => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    report('storage.local', key, error);
    return false;
  }
};

const readAcked = (): Acked => readStored(ackedKey, ackedSchema, {});

const readHold = (): Hold => readStored(holdKey, holdSchema, free);

const writeAcked = (acked: Acked): void => {
  writeStored(ackedKey, acked);
};

const writeHold = (hold: Hold): void => {
  writeStored(holdKey, hold);
};

export { readAcked, readHold, writeAcked, writeHold };
