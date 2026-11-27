import { ByteSize, Clock, Effect, Layer } from 'effect';
import {
  HttpIncomingMessage,
  HttpRouter,
  HttpServer,
  HttpServerResponse,
  type HttpServerRequest,
} from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';

import { accountOf, dayLimits, hasRoom, secondsToNextDay } from './budget';
import { Full, intakeApi, TooLarge, Unavailable, Unreadable, type Ticket } from './contract';
import { bodyLimit, plainHeaders, retryLater, textLimit } from './limits';
import { Store, type Origin, type Storage } from './store';

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

const keep = Effect.fn('intake.accept')(function* keeping(
  store: Storage,
  { body, request, ticket }: Upload,
) {
  const now = yield* Clock.currentTimeMillis;
  const origin = originOf(request);
  const account = accountOf(origin.ip, now);
  const spent = yield* store.spent(account, ticket.actor);
  const size = body.byteLength;
  const roomy =
    hasRoom(spent.network, size, dayLimits.network) && hasRoom(spent.actor, size, dayLimits.actor);
  if (!roomy) {
    return yield* new Full({ seconds: secondsToNextDay(now) });
  }
  yield* store.keep({ account, body: copyOf(body), now, origin, ticket });
});

const accept = (
  store: Storage,
  upload: Upload,
): Effect.Effect<void, Unreadable | TooLarge | Full | Unavailable> => {
  if (upload.body.byteLength === 0) {
    return Effect.fail(new Unreadable({}));
  }
  if (upload.body.byteLength > bodyLimit) {
    return Effect.fail(new TooLarge({}));
  }
  return keep(store, upload).pipe(
    Effect.tapDefect((defect) => Effect.logError('intake could not be stored', defect)),
    Effect.catchDefect(() => Effect.fail(new Unavailable({ seconds: retryLater }))),
  );
};

const handlers = HttpApiBuilder.group(intakeApi, 'Intake', (group) =>
  Effect.gen(function* building() {
    const store = yield* Store;
    return group.handle('accept', ({ payload, query, request }) =>
      accept(store, { body: payload, request, ticket: query }),
    );
  }),
);

const plain = HttpRouter.middleware(
  (respond) => Effect.map(respond, HttpServerResponse.setHeaders(plainHeaders)),
  { global: true },
);

const readLimit = Layer.succeed(HttpIncomingMessage.MaxBodySize, ByteSize.bytes(bodyLimit));

const intakeApp = HttpApiBuilder.layer(intakeApi).pipe(
  Layer.provide(handlers),
  Layer.provide(HttpServer.layerServices),
  Layer.provide(readLimit),
  Layer.merge(plain),
);

export { intakeApp };
