import { expect, test } from 'bun:test';

import {
  compilerVersion,
  contestOutput,
  digestOf,
  hasContestCompiler,
} from '@konekode/course/contest';
import { results } from '@konekode/course/results';
import { allChecks } from '@konekode/course/units';

import { knownOutcome } from '@/lib/run/known';

const checks = allChecks();
const compilerHere = await hasContestCompiler();
const longEnough = 240_000;

const rowFor = (unit: string, id: string): (typeof results)[number] | undefined =>
  results.find((row) => row.unit === unit && row.id === id);

test('every task has a stored result, and no result is left over', () => {
  expect(results.map((row) => `${row.unit}/${row.id}`)).toEqual(
    checks.map((check) => `${check.unit}/${check.id}`),
  );
});

test('a stored result belongs to the program and input the unit has now', () => {
  for (const check of checks) {
    expect(rowFor(check.unit, check.id)?.digest).toBe(digestOf(check.program, check.input));
  }
});

test('a stored result is what the unit says the program should print', () => {
  for (const check of checks) {
    expect(rowFor(check.unit, check.id)?.output.trim()).toBe(check.expect);
  }
});

test('running a task program is answered from the stored result, byte for byte', () => {
  for (const check of checks) {
    const output = rowFor(check.unit, check.id)?.output ?? '';
    expect(knownOutcome(check.program, check.input)).toEqual({
      exitCode: 0,
      kind: 'finished',
      output,
    });
  }
});

test('any other program or input is not answered from the stored results', () => {
  for (const check of checks) {
    expect(knownOutcome(`${check.program} `, check.input)).toBeNull();
    expect(knownOutcome(check.program, `${check.input}1`)).toBeNull();
  }
});

test('continuous integration has the contest compiler', async () => {
  const wanted = [' 13.3.0', ''][Number(Bun.env.CI === undefined)] ?? '';
  expect(await compilerVersion()).toContain(wanted);
});

test.skipIf(!compilerHere)(
  'the contest compiler prints exactly the stored result for every task',
  async () => {
    const [first, ...rest] = checks;
    const compare = async (check: (typeof checks)[number] | undefined): Promise<void> => {
      if (check === undefined) {
        return;
      }
      const output = await contestOutput(check.program, check.input);
      const stored = rowFor(check.unit, check.id);
      expect(stored).toBeDefined();
      expect(output).toBe(stored?.output ?? '');
    };
    await compare(first);
    await rest.reduce(async (before, check) => {
      await before;
      await compare(check);
    }, Promise.resolve());
  },
  { timeout: longEnough },
);
