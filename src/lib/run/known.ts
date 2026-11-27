import { results } from '@konekode/course/results';
import { allChecks } from '@konekode/course/units';

import type { Outcome } from './protocol';

const separator = '\u0000';

const outputs = new Map(results.map((row) => [`${row.unit}${separator}${row.id}`, row.output]));

const table = new Map(
  allChecks().flatMap((check): Array<[string, string]> => {
    const output = outputs.get(`${check.unit}${separator}${check.id}`);
    if (output === undefined) {
      return [];
    }
    return [[`${check.program}${separator}${check.input}`, output]];
  }),
);

const knownOutcome = (source: string, input: string): Outcome | null => {
  const output = table.get(`${source}${separator}${input}`);
  if (output === undefined) {
    return null;
  }
  return { exitCode: 0, kind: 'finished', output };
};

export { knownOutcome };
