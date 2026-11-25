import { Schema, SchemaTransformation } from 'effect';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api';

import { intakeContentType, intakePath, seqLimit } from './limits';

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

const accept = HttpApiEndpoint.post('accept', intakePath, {
  payload: body,
  query: ticket,
  success: HttpApiSchema.NoContent,
});

const intakeGroup = HttpApiGroup.make('Intake').add(accept);

const intakeApi = HttpApi.make('IntakeApi').add(intakeGroup);

export { intakeApi, ticket, type Ticket };
