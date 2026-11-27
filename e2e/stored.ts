import { Effect, Schema } from 'effect';

import type { Page } from '@playwright/test';

const storedEvent = Schema.Struct({
  at: Schema.Finite,
  kind: Schema.String,
  ref: Schema.String,
  unit: Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed(''))),
});
const decodeStored = Schema.decodeUnknownSync(Schema.Array(storedEvent));
const readStored = async (page: Page): Promise<unknown> =>
  await page.evaluate(
    async () =>
      await new Promise<unknown>((resolve, reject) => {
        const opening = indexedDB.open('konekode');
        opening.addEventListener('error', () => {
          reject(new Error('cannot open the database'));
        });
        opening.addEventListener('success', () => {
          const all = opening.result.transaction('events').objectStore('events').getAll();
          all.addEventListener('success', () => {
            resolve(all.result);
          });
        });
      }),
  );

const storedPosition = async (page: Page): Promise<string> => {
  let latest = { at: -1, ref: '' };
  for (const event of decodeStored(await readStored(page))) {
    if (event.kind === 'beat.reached' && event.at >= latest.at) {
      latest = event;
    }
  }
  return latest.ref;
};

const storedSummary = async (page: Page): Promise<string> => {
  const events = decodeStored(await readStored(page));
  const faults = events.filter((event) => event.kind.startsWith('storage.')).length;
  const reached = events.filter((event) => event.kind === 'beat.reached').length;
  return `${String(events.length)} events stored, ${String(reached)} sentences reached, ${String(faults)} storage faults`;
};

const recordedAs = async (page: Page, label: string): Promise<number> =>
  decodeStored(await readStored(page)).filter(
    (event) => `${event.kind} ${event.unit} ${event.ref}` === label,
  ).length;

export { decodeStored, readStored, recordedAs, storedPosition, storedSummary };
