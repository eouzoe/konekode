import { expect, test } from 'bun:test';

import { Effect, Option, Schema } from 'effect';
import { HttpRouter } from 'effect/http';

import { accountOf, dayLimits, networkOf, secondsToNextDay, type Usage } from './budget';
import { ticket, type Ticket } from './contract';
import { intakeFor } from './intake';
import { bodyLimit, intakeContentType, intakePath } from './limits';
import { type Parcel, type Storage } from './store';

const actor = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const origin = 'https://example.test';
const unused: Usage = { batches: 0, bytes: 0 };
const expected: Ticket = {
  actor,
  encoding: 'gzip',
  kind: 'events',
  seq: 7,
  session,
  site: '8141515',
};

const query = (changes: Record<string, string> = {}): URLSearchParams =>
  new URLSearchParams({
    actor,
    encoding: 'gzip',
    kind: 'events',
    seq: '7',
    session,
    site: '8141515',
    ...changes,
  });

interface Fake {
  readonly kept: Parcel[];
  readonly store: Storage;
}

const recording = (network: Usage = unused, own: Usage = unused): Fake => {
  const kept: Parcel[] = [];
  const store: Storage = {
    keep: (parcel) =>
      Effect.sync(() => {
        kept.push(parcel);
      }),
    spent: () => Effect.succeed({ actor: own, network }),
  };
  return { kept, store };
};

const failing: Storage = {
  keep: () => Effect.die(new Error('no such table')),
  spent: () => Effect.die(new Error('no such table')),
};

const serve = async (store: Storage, request: Request): Promise<Response> => {
  const { dispose, handler } = HttpRouter.toWebHandler(intakeFor(store));
  const response = await handler(request);
  await dispose();
  return response;
};

const statusOf = async (store: Storage, request: Request): Promise<number> => {
  const response = await serve(store, request);
  return response.status;
};

const post = (search: URLSearchParams, init: RequestInit = {}): Request =>
  new Request(`${origin}${intakePath}?${search.toString()}`, {
    body: 'payload',
    headers: { 'content-type': intakeContentType },
    method: 'POST',
    ...init,
  });

const fresh = (): Request => post(query());

const empty = (): Request => post(query(), { body: '' });

const decoded = (value: ArrayBuffer | undefined): string => new TextDecoder().decode(value);

const readTicket = (search: URLSearchParams): unknown => {
  const fields = Object.fromEntries(search);
  return Option.getOrNull(Schema.decodeUnknownOption(ticket)(fields));
};

test('a complete ticket is read from the query', () => {
  expect(readTicket(query())).toEqual(expected);
});

test('a ticket with any malformed field is refused', () => {
  const broken = [
    { actor: 'someone' },
    { session: 'legacy' },
    { kind: 'anything' },
    { encoding: 'br' },
    { seq: '-1' },
    { seq: '1.5' },
    { seq: 'x' },
    { seq: '1e3' },
    { seq: '0x10' },
    { seq: ' 7' },
    { seq: '' },
    { seq: '1000000001' },
    { site: 'UPPER CASE' },
  ];
  for (const changes of broken) {
    expect(readTicket(query(changes))).toBeNull();
  }
  const missing = query();
  missing.delete('actor');
  expect(readTicket(missing)).toBeNull();
});

test('a valid batch is stored once with where it came from', async () => {
  const { kept, store } = recording();
  const headers = {
    'cf-connecting-ip': '203.0.113.9',
    'content-type': intakeContentType,
    'user-agent': 'probe',
  };
  const request = post(query(), { headers });
  expect(await statusOf(store, request)).toBe(204);
  expect(kept).toHaveLength(1);
  const [parcel] = kept;
  expect(parcel?.ticket).toEqual(expected);
  expect(parcel?.origin.ip).toBe('203.0.113.9');
  expect(parcel?.origin.agent).toBe('probe');
  expect(parcel?.account.network).toBe('203.0.113.9');
  expect(parcel?.account.day).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  expect(decoded(parcel?.body)).toBe('payload');
});

test('a network that has used up its day is refused and nothing is stored', async () => {
  const full = recording({ batches: dayLimits.network.batches, bytes: 0 });
  const heavy = recording({ batches: 1, bytes: dayLimits.network.bytes });
  const light = recording({ batches: 1, bytes: 1 });
  const answers = await Promise.all([
    statusOf(full.store, fresh()),
    statusOf(heavy.store, fresh()),
    statusOf(light.store, fresh()),
  ]);
  expect(answers).toEqual([429, 429, 204]);
  expect([full.kept.length, heavy.kept.length, light.kept.length]).toEqual([0, 0, 1]);
});

test('one browser that has used up its own day is refused while its network still has room', async () => {
  const spent = recording({ batches: 1, bytes: 1 }, { batches: dayLimits.actor.batches, bytes: 0 });
  const large = recording({ batches: 1, bytes: 1 }, { batches: 1, bytes: dayLimits.actor.bytes });
  const answers = await Promise.all([
    statusOf(spent.store, fresh()),
    statusOf(large.store, fresh()),
  ]);
  expect(answers).toEqual([429, 429]);
  expect([spent.kept.length, large.kept.length]).toEqual([0, 0]);
});

test('a refusal says how long until the day turns over', async () => {
  const full = recording({ batches: dayLimits.network.batches, bytes: 0 });
  const response = await serve(full.store, fresh());
  const wait = Number(response.headers.get('retry-after'));
  expect(wait).toBeGreaterThanOrEqual(1);
  expect(wait).toBeLessThanOrEqual(86_400);
  expect(secondsToNextDay(Date.UTC(2026, 10, 20, 23, 59, 59))).toBe(1);
  expect(secondsToNextDay(Date.UTC(2026, 10, 20, 0, 0, 0))).toBe(86_400);
  expect(secondsToNextDay(Date.UTC(2026, 10, 20, 16, 0, 0))).toBe(8 * 3600);
});

test('a class of forty on one address for two hours, at the busiest pace measured, is never refused', () => {
  const busiest = { batches: 55, bytes: 600_000 };
  const learners = 40;
  const lesson = 2;
  const schoolDay = 8;
  expect(learners * lesson * busiest.batches).toBeLessThan(dayLimits.network.batches);
  expect(learners * lesson * busiest.bytes).toBeLessThan(dayLimits.network.bytes);
  expect(schoolDay * busiest.batches).toBeLessThan(dayLimits.actor.batches);
  expect(schoolDay * busiest.bytes).toBeLessThan(dayLimits.actor.bytes);
});

test('the budget is kept per address, or per /64 for the newer kind of address', () => {
  expect(networkOf('203.0.113.9')).toBe('203.0.113.9');
  expect(networkOf('2001:db8:1:2:3:4:5:6')).toBe('2001:db8:1:2::/64');
  expect(networkOf('2001:0db8::1')).toBe('2001:db8:0:0::/64');
  expect(networkOf('::1')).toBe('0:0:0:0::/64');
  expect(networkOf('')).toBe('');
  expect(accountOf('203.0.113.9', 0)).toEqual({ day: '1970-01-01', network: '203.0.113.9' });
});

test('an empty, malformed or oversized batch is refused before storing', async () => {
  const { kept, store } = recording();
  const oversized = 'x'.repeat(bodyLimit + 1);
  const requests = [
    post(query(), { body: '' }),
    post(query({ kind: 'nope' })),
    post(query(), { body: oversized }),
  ];
  const answers = await Promise.all(requests.map((request) => statusOf(store, request)));
  expect(answers).toEqual([400, 400, 413]);
  expect(kept).toEqual([]);
});

test('every answer from the intake tells the browser not to guess its type', async () => {
  const { store } = recording();
  const full = recording({ batches: dayLimits.network.batches, bytes: 0 });
  const answers = await Promise.all([
    serve(store, fresh()),
    serve(store, empty()),
    serve(full.store, fresh()),
    serve(failing, fresh()),
  ]);
  expect(answers.map((response) => response.headers.get('x-content-type-options'))).toEqual(
    Array.from({ length: answers.length }, () => 'nosniff'),
  );
});

test('a failing database answers 503 so the browser retries later', async () => {
  const failed = await serve(failing, fresh());
  expect(failed.status).toBe(503);
  expect(failed.headers.get('retry-after')).toBe('60');
});
