import { ByteSize, Clock, Effect, Layer } from 'effect';
import {
  HttpIncomingMessage,
  HttpServer,
  HttpServerResponse,
  type HttpServerRequest,
} from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { accountOf, dayLimits, hasRoom, secondsToNextDay } from './budget';
import { intakeApi, type Ticket } from './contract';
import { bodyLimit, plainHeaders, retryLater, status, textLimit } from './limits';

import type { Origin, Storage } from './store';

type Reply = HttpServerResponse.HttpServerResponse;

const reply = (code: number): Reply =>
  HttpServerResponse.empty({ headers: plainHeaders, status: code });

const replyAfter = (code: number, seconds: number): Reply =>
  HttpServerResponse.empty({
    headers: { ...plainHeaders, 'retry-after': String(seconds) },
    status: code,
  });

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

const originOf = (request: HttpServerRequest.HttpServerRequest): Origin => {
  const place = field(request.source, 'cf');
  return {
    agent: text(request.headers['user-agent']),
    asn: count(field(place, 'asn')),
    city: text(field(place, 'city')),
    country: text(field(place, 'country')),
    ip: text(request.headers['cf-connecting-ip']),
    network: text(field(place, 'asOrganization')),
    region: text(field(place, 'region')),
    timezone: text(field(place, 'timezone')),
  };
};

const copyOf = (body: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(body.byteLength);
  copy.set(body);
  return copy.buffer;
};

interface Upload {
  readonly body: Uint8Array;
  readonly request: HttpServerRequest.HttpServerRequest;
  readonly ticket: Ticket;
}

const keep = <Needs>(
  store: Storage<Needs>,
  { body, ticket }: Upload,
  origin: Origin,
): Effect.Effect<Reply, never, Needs> =>
  Effect.gen(function* keeping() {
    const now = yield* Clock.currentTimeMillis;
    const account = accountOf(origin.ip, now);
    const spent = yield* store.spent(account, ticket.actor);
    const size = body.byteLength;
    const roomy =
      hasRoom(spent.network, size, dayLimits.network) &&
      hasRoom(spent.actor, size, dayLimits.actor);
    if (!roomy) {
      return replyAfter(status.tooMany, secondsToNextDay(now));
    }
    yield* store.keep({ account, body: copyOf(body), now, origin, ticket });
    return reply(status.stored);
  });

const accept = <Needs>(
  store: Storage<Needs>,
  upload: Upload,
): Effect.Effect<Reply, never, Needs> => {
  const { body, request } = upload;
  if (body.byteLength === 0) {
    return Effect.succeed(reply(status.unreadable));
  }
  if (body.byteLength > bodyLimit) {
    return Effect.succeed(reply(status.tooLarge));
  }
  const unavailable = Effect.succeed(replyAfter(status.unavailable, retryLater));
  return keep(store, upload, originOf(request)).pipe(
    Effect.tapCause((cause) => Effect.logError('intake could not be stored', cause)),
    Effect.catchDefect(() => unavailable),
  );
};

const intakeFor = <Needs>(store: Storage<Needs>) => {
  const handlers = HttpApiBuilder.group(intakeApi, 'Intake', (group) =>
    group.handle('accept', ({ payload, query, request }) =>
      accept(store, { body: payload, request, ticket: query }),
    ),
  );
  const readLimit = Layer.succeed(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(bodyLimit));
  return HttpApiBuilder.layer(intakeApi).pipe(
    Layer.provide(handlers),
    Layer.provide(HttpServer.layerServices),
    Layer.provide(readLimit),
  );
};

export { intakeFor };
