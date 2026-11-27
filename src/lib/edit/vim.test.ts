import { expect, test } from 'bun:test';

import { keys as commandKeys } from '@konekode/contracts/catalog';
import { checksOf, starterOf } from '@konekode/course/units';
import { Schema } from 'effect';

import { createBuffer, lastColumn, type Rules } from './buffer';
import { run } from './step';

interface Case {
  readonly column: number;
  readonly commands: ReadonlyArray<string>;
  readonly keys: ReadonlyArray<string>;
  readonly line: number;
  readonly start: number;
  readonly text: string;
}

interface Outcome {
  readonly cursor: number;
  readonly text: string;
}

type Groups = ReadonlyArray<ReadonlyArray<string>>;

const rules: Rules = { keys: new Set(commandKeys.map((item) => item.key)), pairs: [] };
const typed: Readonly<Record<string, string>> = {
  Backspace: '\b',
  Enter: '\r',
  Escape: '\u001B',
};
const texts = [starterOf('start') ?? '', ...checksOf('start').map((check) => check.program)];
const kinds: ReadonlyArray<Groups> = [
  [['G']],
  [['$']],
  [['0']],
  [['k']],
  [['j']],
  [['$'], ['k']],
  [['$'], ['j']],
  [['x']],
  [['x'], ['.']],
  [['d', 'j']],
  [['d', 'j'], ['.']],
  [['f', ';']],
  [['f', '<']],
  [['f', ' ']],
  [['i', 'Escape']],
  [['i', 'a', 'b', 'Escape']],
  [['i', 'a', 'Backspace', 'Escape']],
  [['i', 'Enter', 'Z', 'Escape']],
  [['i', 'Enter', 'Escape']],
  [['o', 'Escape']],
  [['o', 'a', ';', 'Escape']],
  [['o', 'a', 'Enter', 'b', 'Escape']],
  [['O', 'Escape']],
  [['O', 'a', ';', 'Escape']],
  [['i', 'a', 'Escape'], ['j'], ['.']],
  [['o', 'a', 'Escape'], ['k'], ['.']],
  [['$'], ['i', ' ', '<', 'Escape'], ['k'], ['$'], ['.']],
];

const toVim = (keys: ReadonlyArray<string>): string =>
  keys.map((key) => typed[key] ?? key).join('');

const caseAt = (text: string, start: number, groups: Groups): Case => {
  const lines = text.slice(0, start).split('\n');
  return {
    column: (lines.at(-1)?.length ?? 0) + 1,
    commands: groups.map((keys) => toVim(keys)),
    keys: groups.flat(),
    line: lines.length,
    start,
    text,
  };
};

const positions = (text: string): Array<number> =>
  Array.from({ length: text.length }, (_unused, at) => at).filter(
    (at) => at <= lastColumn(text, at),
  );

const allCases = (): Array<Case> =>
  texts.flatMap((text) =>
    positions(text).flatMap((start) => kinds.map((groups) => caseAt(text, start, groups))),
  );

const decodeOutcomes = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ cursor: Schema.Finite, text: Schema.String })),
);

const askVim = async (cases: ReadonlyArray<Case>): Promise<Array<Outcome>> => {
  const base = `${Bun.env.TMPDIR ?? '/tmp'}/oracle-${crypto.randomUUID()}`;
  const input = Bun.file(`${base}.in.json`);
  const output = Bun.file(`${base}.out.json`);
  await Bun.write(input, JSON.stringify(cases));
  const script = new URL('oracle.vim', import.meta.url).pathname;
  const child = Bun.spawn(['vim', '-u', 'NONE', '-i', 'NONE', '-N', '-es', '-S', script], {
    env: { ORACLE_IN: `${base}.in.json`, ORACLE_OUT: `${base}.out.json`, PATH: Bun.env.PATH ?? '' },
    stderr: 'ignore',
    stdin: 'ignore',
    stdout: 'ignore',
  });
  await child.exited;
  const results = [...decodeOutcomes(await output.json())];
  await Promise.all([input.delete(), output.delete()]);
  return results;
};

const ours = (item: Case): Outcome => {
  const end = run(createBuffer(item.text, item.start), item.keys, rules);
  return { cursor: end.cursor, text: end.text };
};

test('every command from every position of every program agrees with Vim', async () => {
  const cases = allCases();
  const theirs = await askVim(cases);
  expect(theirs).toHaveLength(cases.length);
  const differing = cases
    .map((item, at) => ({ item, mine: ours(item), vim: theirs[at] }))
    .filter(({ mine, vim }) => mine.text !== vim?.text || mine.cursor !== vim.cursor);
  const dump = Bun.env.ORACLE_DIFF ?? '';
  if (dump !== '') {
    await Bun.write(dump, JSON.stringify({ differing, total: cases.length }));
  }
  expect(differing.length).toBe(0);
}, 120_000);
