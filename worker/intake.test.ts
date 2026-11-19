import { expect, test } from 'bun:test';

import { accountOf, dayLimits, networkOf, secondsToNextDay } from './budget';
import { acceptIntake, bodyLimit, intakePath, readTicket, type Database } from './intake';

const actor = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const origin = 'https://example.test';

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
  readonly database: Database;
  readonly rows: unknown[][];
}

const recording = (used: unknown = null, actorUsed: unknown = null): Fake => {
  const usageFor = (text: string): unknown => {
    if (text.includes('intake_actor_usage')) {
      return actorUsed;
    }
    return used;
  };
  const rows: unknown[][] = [];
  const pending = new Map<object, readonly unknown[]>();
  const database: Database = {
    batch: async (statements) => {
      for (const statement of statements) {
        rows.push([...(pending.get(statement) ?? [])]);
      }
      await Promise.resolve();
    },
    prepare: (text) => {
      const statement = {
        bind: (...values: readonly unknown[]) => {
          pending.set(statement, [text, ...values]);
          return statement;
        },
        first: () => Promise.resolve(usageFor(text)),
      };
      return statement;
    },
  };
  return { database, rows };
};

const failing: Database = {
  batch: () => Promise.resolve(),
  prepare: () => {
    throw new Error('no such table');
  },
};

const statusOf = async (request: Request, url: URL, database?: Database): Promise<number> => {
  const response = await acceptIntake(request, url, database);
  return response.status;
};

const decoded = (value: unknown): string => {
  if (!(value instanceof ArrayBuffer)) {
    throw new TypeError('expected the stored body to be bytes');
  }
  return new TextDecoder().decode(value);
};

const post = (search: URLSearchParams, init: RequestInit = {}): [Request, URL] => {
  const url = new URL(`${origin}${intakePath}?${search.toString()}`);
  return [new Request(url, { body: 'payload', method: 'POST', ...init }), url];
};

test('a complete ticket is read from the query', () => {
  expect(readTicket(query())).toEqual({
    actor,
    encoding: 'gzip',
    kind: 'events',
    seq: 7,
    session,
    site: '8141515',
  });
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
  const { database, rows } = recording();
  const [request, url] = post(query(), {
    headers: { 'cf-connecting-ip': '203.0.113.9', origin, 'user-agent': 'probe' },
  });
  expect(await statusOf(request, url, database)).toBe(204);
  expect(rows).toHaveLength(3);
  const [row, charge, own] = rows;
  expect(row?.slice(2, 9)).toEqual(['events', actor, session, 7, '8141515', 'gzip', '203.0.113.9']);
  expect(row?.at(-2)).toBe('probe');
  expect(decoded(row?.at(-1))).toBe('payload');
  expect(charge?.[1]).toBe('203.0.113.9');
  expect(charge?.[2]).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  expect(charge?.at(-1)).toBe('payload'.length);
  expect(own?.slice(1)).toEqual([actor, charge?.[2], 'payload'.length]);
});

test('a network that has used up its day is refused and nothing is stored', async () => {
  const full = recording({ batches: dayLimits.network.batches, bytes: 0 });
  const heavy = recording({ batches: 1, bytes: dayLimits.network.bytes });
  const light = recording({ batches: 1, bytes: 1 });
  const [first, firstUrl] = post(query());
  const [second, secondUrl] = post(query());
  const [third, thirdUrl] = post(query());
  expect(await statusOf(first, firstUrl, full.database)).toBe(429);
  expect(await statusOf(second, secondUrl, heavy.database)).toBe(429);
  expect(await statusOf(third, thirdUrl, light.database)).toBe(204);
  expect([full.rows.length, heavy.rows.length, light.rows.length]).toEqual([0, 0, 3]);
});

test('one browser that has used up its own day is refused while its network still has room', async () => {
  const spent = recording({ batches: 1, bytes: 1 }, { batches: dayLimits.actor.batches, bytes: 0 });
  const large = recording({ batches: 1, bytes: 1 }, { batches: 1, bytes: dayLimits.actor.bytes });
  const [first, firstUrl] = post(query());
  const [second, secondUrl] = post(query());
  expect(await statusOf(first, firstUrl, spent.database)).toBe(429);
  expect(await statusOf(second, secondUrl, large.database)).toBe(429);
  expect([spent.rows.length, large.rows.length]).toEqual([0, 0]);
});

test('a refusal says how long until the day turns over', async () => {
  const full = recording({ batches: dayLimits.network.batches, bytes: 0 });
  const [request, url] = post(query());
  const response = await acceptIntake(request, url, full.database);
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

test('anything but a same-origin POST with a body is refused before storing', async () => {
  const { database, rows } = recording();
  const url = new URL(`${origin}${intakePath}?${query().toString()}`);
  const [foreign, foreignUrl] = post(query(), { headers: { origin: 'https://elsewhere.test' } });
  const [empty, emptyUrl] = post(query(), { body: '' });
  const [malformed, malformedUrl] = post(query({ kind: 'nope' }));
  const [huge, hugeUrl] = post(query(), { body: 'x'.repeat(bodyLimit + 1) });
  expect(await statusOf(new Request(url), url, database)).toBe(405);
  expect(await statusOf(foreign, foreignUrl, database)).toBe(403);
  expect(await statusOf(empty, emptyUrl, database)).toBe(400);
  expect(await statusOf(malformed, malformedUrl, database)).toBe(400);
  expect(await statusOf(huge, hugeUrl, database)).toBe(413);
  expect(rows).toEqual([]);
});

test('every answer from the intake tells the browser not to guess its type', async () => {
  const { database } = recording();
  const [request, url] = post(query());
  const response = await acceptIntake(request, url, database);
  expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});

test('a missing or failing database answers 503 so the browser retries later', async () => {
  const [first, firstUrl] = post(query());
  const [second, secondUrl] = post(query());
  expect(await statusOf(first, firstUrl)).toBe(503);
  const failed = await acceptIntake(second, secondUrl, failing);
  expect(failed.status).toBe(503);
  expect(failed.headers.get('retry-after')).toBe('60');
});
