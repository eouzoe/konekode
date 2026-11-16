import { expect, test } from 'bun:test';

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

const recording = (): { database: Database; rows: unknown[][] } => {
  const rows: unknown[][] = [];
  const database: Database = {
    prepare: () => {
      let bound: readonly unknown[] = [];
      const statement = {
        bind: (...values: readonly unknown[]) => {
          bound = values;
          return statement;
        },
        run: async () => {
          rows.push([...bound]);
          await Promise.resolve();
        },
      };
      return statement;
    },
  };
  return { database, rows };
};

const failing: Database = {
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
  expect(rows).toHaveLength(1);
  const [row] = rows;
  expect(row?.slice(1, 8)).toEqual(['events', actor, session, 7, '8141515', 'gzip', '203.0.113.9']);
  expect(row?.at(-2)).toBe('probe');
  expect(decoded(row?.at(-1))).toBe('payload');
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

test('a missing or failing database answers 503 so the browser retries later', async () => {
  const [first, firstUrl] = post(query());
  const [second, secondUrl] = post(query());
  expect(await statusOf(first, firstUrl)).toBe(503);
  expect(await statusOf(second, secondUrl, failing)).toBe(503);
});
