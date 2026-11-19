import {
  accountOf,
  addActorUsage,
  addUsage,
  dayLimits,
  hasRoom,
  readActorUsage,
  readUsage,
  secondsToNextDay,
  usageOf,
} from './budget';

interface Statement {
  readonly bind: (...values: readonly unknown[]) => Statement;
  readonly first: () => Promise<unknown>;
}

interface Database {
  readonly batch: (statements: readonly Statement[]) => Promise<unknown>;
  readonly prepare: (query: string) => Statement;
}

interface Ticket {
  readonly actor: string;
  readonly encoding: string;
  readonly kind: string;
  readonly seq: number;
  readonly session: string;
  readonly site: string;
}

interface Origin {
  readonly agent: string;
  readonly asn: number;
  readonly city: string;
  readonly country: string;
  readonly ip: string;
  readonly network: string;
  readonly region: string;
  readonly timezone: string;
}

const intakePath = '/api/intake';
const bodyLimit = 1_000_000;
const seqLimit = 1_000_000_000;
const textLimit = 400;
const status = {
  badRequest: 400,
  forbidden: 403,
  notAllowed: 405,
  stored: 204,
  tooLarge: 413,
  tooMany: 429,
  unavailable: 503,
};

const identifier = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const siteVersion = /^[0-9a-z.-]{1,40}$/u;
const kinds = new Set(['events', 'replay']);
const encodings = new Set(['gzip', 'identity']);

const insert = `INSERT INTO intake (
  received_at, kind, actor, session, seq, site, encoding,
  ip, country, region, city, asn, network, timezone, agent, body
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const matching = (value: string | null, pattern: RegExp): string | null => {
  if (value === null || !pattern.test(value)) {
    return null;
  }
  return value;
};

const within = (value: string | null, allowed: ReadonlySet<string>): string | null => {
  if (value === null || !allowed.has(value)) {
    return null;
  }
  return value;
};

const digits = /^\d{1,10}$/u;

const whole = (value: string | null): number | null => {
  if (value === null || !digits.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (parsed > seqLimit) {
    return null;
  }
  return parsed;
};

const readTicket = (query: URLSearchParams): Ticket | null => {
  const actor = matching(query.get('actor'), identifier);
  const session = matching(query.get('session'), identifier);
  const site = matching(query.get('site'), siteVersion);
  const kind = within(query.get('kind'), kinds);
  const encoding = within(query.get('encoding'), encodings);
  const seq = whole(query.get('seq'));
  if (
    actor === null ||
    session === null ||
    site === null ||
    kind === null ||
    encoding === null ||
    seq === null
  ) {
    return null;
  }
  return { actor, encoding, kind, seq, session, site };
};

const text = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.slice(0, textLimit);
};

const count = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return 0;
  }
  return value;
};

const field = (source: unknown, name: string): unknown => {
  if (typeof source !== 'object' || source === null) {
    return null;
  }
  const value: unknown = Reflect.get(source, name);
  return value;
};

const readOrigin = (request: Request): Origin => {
  const place: unknown = Reflect.get(request, 'cf');
  return {
    agent: text(request.headers.get('user-agent')),
    asn: count(field(place, 'asn')),
    city: text(field(place, 'city')),
    country: text(field(place, 'country')),
    ip: text(request.headers.get('cf-connecting-ip')),
    network: text(field(place, 'asOrganization')),
    region: text(field(place, 'region')),
    timezone: text(field(place, 'timezone')),
  };
};

const retryLater = 60;

const plainHeaders = { 'x-content-type-options': 'nosniff' };

const reply = (code: number, retryAfter: number | null = null): Response => {
  if (retryAfter === null) {
    return new Response(null, { headers: plainHeaders, status: code });
  }
  return new Response(null, {
    headers: { ...plainHeaders, 'retry-after': String(retryAfter) },
    status: code,
  });
};

const refusal = (request: Request, url: URL): number | null => {
  if (request.method !== 'POST') {
    return status.notAllowed;
  }
  const from = request.headers.get('origin');
  if (from !== null && from !== url.origin) {
    return status.forbidden;
  }
  if (Number(request.headers.get('content-length') ?? '0') > bodyLimit) {
    return status.tooLarge;
  }
  return null;
};

interface Parcel {
  readonly body: ArrayBuffer;
  readonly now: number;
  readonly origin: Origin;
  readonly ticket: Ticket;
}

const storing = (database: Database, { body, now, origin, ticket }: Parcel): Statement =>
  database
    .prepare(insert)
    .bind(
      now,
      ticket.kind,
      ticket.actor,
      ticket.session,
      ticket.seq,
      ticket.site,
      ticket.encoding,
      origin.ip,
      origin.country,
      origin.region,
      origin.city,
      origin.asn,
      origin.network,
      origin.timezone,
      origin.agent,
      body,
    );

const keep = async (database: Database, parcel: Parcel): Promise<Response> => {
  const account = accountOf(parcel.origin.ip, parcel.now);
  const { actor } = parcel.ticket;
  const size = parcel.body.byteLength;
  const [network, own] = await Promise.all([
    database.prepare(readUsage).bind(account.network, account.day).first(),
    database.prepare(readActorUsage).bind(actor, account.day).first(),
  ]);
  if (
    !hasRoom(usageOf(network), size, dayLimits.network) ||
    !hasRoom(usageOf(own), size, dayLimits.actor)
  ) {
    return reply(status.tooMany, secondsToNextDay(parcel.now));
  }
  await database.batch([
    storing(database, parcel),
    database.prepare(addUsage).bind(account.network, account.day, size),
    database.prepare(addActorUsage).bind(actor, account.day, size),
  ]);
  return reply(status.stored);
};

const receive = async (request: Request, database: Database, ticket: Ticket): Promise<Response> => {
  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return reply(status.badRequest);
  }
  if (body.byteLength > bodyLimit) {
    return reply(status.tooLarge);
  }
  try {
    const parcel = { body, now: Date.now(), origin: readOrigin(request), ticket };
    return await keep(database, parcel);
  } catch {
    return reply(status.unavailable, retryLater);
  }
};

const acceptIntake = (
  request: Request,
  url: URL,
  database?: Database,
): Promise<Response> | Response => {
  const refused = refusal(request, url);
  if (refused !== null) {
    return reply(refused);
  }
  const ticket = readTicket(url.searchParams);
  if (ticket === null) {
    return reply(status.badRequest);
  }
  if (database === undefined) {
    return reply(status.unavailable, retryLater);
  }
  return receive(request, database, ticket);
};

export { acceptIntake, bodyLimit, intakePath, readTicket, type Database, type Ticket };
