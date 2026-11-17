import { contestOutput, digestOf, hasContestCompiler } from './contest';
import { allChecks, type UnitCheck } from './index';

interface Row {
  readonly digest: string;
  readonly id: string;
  readonly output: string;
  readonly unit: string;
}

const rowOf = async (check: UnitCheck): Promise<Row> => ({
  digest: digestOf(check.program, check.input),
  id: check.id,
  output: await contestOutput(check.program, check.input),
  unit: check.unit,
});

const inTurn = async (checks: readonly UnitCheck[], done: readonly Row[]): Promise<Row[]> => {
  const [first, ...rest] = checks;
  if (first === undefined) {
    return [...done];
  }
  const row = await rowOf(first);
  return inTurn(rest, [...done, row]);
};

if (!(await hasContestCompiler())) {
  throw new Error('the contest compiler, g++ 13.3.0 at /usr/bin/g++, is required');
}
const rows = await inTurn(allChecks(), []);
const body = `const results = ${JSON.stringify(rows)};\n\nexport { results };\n`;
await Bun.write(new URL('results.ts', import.meta.url).pathname, body);
