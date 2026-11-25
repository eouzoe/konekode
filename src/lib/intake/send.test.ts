import { expect, test } from 'bun:test';

import { Option, Schema } from 'effect';
import { assert, constantFrom, integer, property, record, stringMatching, uuid } from 'fast-check';

import { ticket } from '../../../backend/contract';
import { intakePath, seqLimit } from '../../../backend/limits';
import { address, type Ticket } from './send';

const base = 'https://cp.example';
const identifier = uuid().map((value) => value.toLowerCase());
const sent = record({
  actor: identifier,
  kind: constantFrom('events' as const, 'replay' as const),
  seq: integer({ max: seqLimit, min: 0 }),
  session: identifier,
  site: stringMatching(/^[0-9a-z.-]{1,40}$/u),
});
const encodings = constantFrom('gzip' as const, 'identity' as const);

const readBack = (path: string): unknown => {
  const fields = Object.fromEntries(new URL(path, base).searchParams);
  return Option.getOrNull(Schema.decodeUnknownOption(ticket)(fields));
};

test('whatever envelope the page sends, the backend reads back unchanged', () => {
  assert(
    property(sent, encodings, (each: Ticket, encoding) => {
      const path = address(each, encoding);
      expect(new URL(path, base).pathname).toBe(intakePath);
      expect(readBack(path)).toEqual({ ...each, encoding });
    }),
  );
});
