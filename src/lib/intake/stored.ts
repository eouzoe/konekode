import { Option, Schema } from 'effect';

import { report } from '@/lib/fault/fault';

import { free, type Hold } from './plan';

import type { Acked } from './pending';

const ackedKey = 'cp:intake:acked';
const holdKey = 'cp:intake:hold';
const ackedSchema = Schema.Record(Schema.String, Schema.Finite);
const holdSchema = Schema.Struct({ failures: Schema.Finite, until: Schema.Finite });

const readStored = <Value>(key: string, schema: Schema.Decoder<Value>, fallback: Value): Value => {
  try {
    const parsed = Schema.decodeUnknownOption(schema)(
      JSON.parse(localStorage.getItem(key) ?? 'null'),
    );
    if (Option.isSome(parsed)) {
      return parsed.value;
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
