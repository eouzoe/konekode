import { say, ui } from '@konekode/course/ui';

const newline = '\n';

const linesOf = (text: string): Array<string> => text.trim().split(newline);

const squash = (text: string): string => text.replaceAll(/\s+/gu, '');

const sameLines = (want: ReadonlyArray<string>, got: ReadonlyArray<string>): boolean =>
  want.toSorted().join(newline) === got.toSorted().join(newline);

const firstDifference = (want: ReadonlyArray<string>, got: ReadonlyArray<string>): string => {
  const at = want.findIndex((line, index) => line !== got[index]);
  return say('wrong.line', {
    got: got[at] ?? '',
    line: String(at + 1),
    want: want[at] ?? '',
  });
};

const counted = (want: ReadonlyArray<string>, got: ReadonlyArray<string>): string => {
  const values = { got: String(got.length), want: String(want.length) };
  if (got.length < want.length) {
    return say('wrong.fewer', values);
  }
  if (got.length > want.length) {
    return say('wrong.more', values);
  }
  return firstDifference(want, got);
};

const diagnose = (expected: string, actual: string): string => {
  const want = linesOf(expected);
  const got = linesOf(actual);
  if (actual.trim() === '') {
    return ui['wrong.nothing'];
  }
  if (squash(actual) === squash(expected)) {
    return ui['wrong.spacing'];
  }
  if (sameLines(want, got)) {
    return ui['wrong.order'];
  }
  return counted(want, got);
};

export { diagnose };
