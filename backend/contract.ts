import { Schema, SchemaTransformation } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';

import { intakeContentType, intakePath, seqLimit, status } from './limits';

const identifierPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const sitePattern = /^[0-9a-z.-]{1,40}$/u;
const seqPattern = /^\d{1,10}$/u;

const identifier = Schema.String.check(Schema.isPattern(identifierPattern));
const siteVersion = Schema.String.check(Schema.isPattern(sitePattern));
const seqText = Schema.String.check(Schema.isPattern(seqPattern));
const seqNumber = Schema.Int.check(Schema.isLessThanOrEqualTo(seqLimit));
const seq = seqText.pipe(Schema.decodeTo(seqNumber, SchemaTransformation.numberFromString));

const kind = Schema.Literals(['events', 'replay']);
const encoding = Schema.Literals(['gzip', 'identity']);

const ticket = Schema.Struct({
  actor: identifier,
  encoding,
  kind,
  seq,
  session: identifier,
  site: siteVersion,
});

type Ticket = typeof ticket.Type;

const body = Schema.Uint8Array.pipe(HttpApiSchema.asUint8Array({ contentType: intakeContentType }));

class Unreadable extends Schema.TaggedError<Unreadable>()('Unreadable', {}) {}

class TooLarge extends Schema.TaggedError<TooLarge>()('TooLarge', {}) {}

class Full extends Schema.TaggedError<Full>()('Full', { seconds: Schema.Int }) {}

class Unavailable extends Schema.TaggedError<Unavailable>()('Unavailable', {
  seconds: Schema.Int,
}) {}

const waiting = { 'retry-after': Schema.FiniteFromString };

const unreadable = Unreadable.pipe(
  HttpApiSchema.asNoContent({ decode: () => new Unreadable({}) }),
  HttpApiSchema.status(status.unreadable),
);

const tooLarge = TooLarge.pipe(
  HttpApiSchema.asNoContent({ decode: () => new TooLarge({}) }),
  HttpApiSchema.status(status.tooLarge),
);

const full = Full.pipe(
  HttpApiSchema.encodeToWithHeaders(
    { body: HttpApiSchema.Empty(status.tooMany), headers: waiting },
    {
      decode: ({ headers }) => new Full({ seconds: headers['retry-after'] }),
      encode: (error) => ({ body: undefined, headers: { 'retry-after': error.seconds } }),
    },
  ),
);

const unavailable = Unavailable.pipe(
  HttpApiSchema.encodeToWithHeaders(
    { body: HttpApiSchema.Empty(status.unavailable), headers: waiting },
    {
      decode: ({ headers }) => new Unavailable({ seconds: headers['retry-after'] }),
      encode: (error) => ({ body: undefined, headers: { 'retry-after': error.seconds } }),
    },
  ),
);

const accept = HttpApiEndpoint.post('accept', intakePath, {
  error: [unreadable, tooLarge, full, unavailable],
  payload: body,
  query: ticket,
  success: HttpApiSchema.NoContent,
});

const intakeGroup = HttpApiGroup.make('Intake').add(accept);

const intakeApi = HttpApi.make('IntakeApi').add(intakeGroup);

export { Full, intakeApi, ticket, TooLarge, Unavailable, Unreadable, type Ticket };
