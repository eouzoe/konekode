import { say } from '@/lib/text/ui';

interface Problem {
  readonly line: string;
  readonly text: string;
}

type Rule = readonly [pattern: RegExp, tell: (line: string, found: readonly string[]) => string];

const header = /main\.cpp:(?<line>\d+):\d+: (?:fatal )?error: (?<text>.+)/u;

const rules: readonly Rule[] = [
  [/^expected ';'/u, (line) => say('explain.semicolon', { line })],
  [
    /^use of undeclared identifier '(?<name>[^']+)'; did you mean '(?<guess>[^']+)'/u,
    (line, [name = '', guess = '']) => say('explain.undeclaredGuess', { guess, line, name }),
  ],
  [
    /^use of undeclared identifier '(?<name>[^']+)'/u,
    (line, [name = '']) => say('explain.undeclared', { line, name }),
  ],
  [
    /^unknown type name '(?<name>[^']+)'/u,
    (line, [name = '']) => say('explain.unknownType', { line, name }),
  ],
  [/^invalid operands to binary expression/u, (line) => say('explain.operands', { line })],
  [/^expected '\}'/u, () => say('explain.missingBrace')],
  [/^extraneous closing brace/u, (line) => say('explain.extraBrace', { line })],
  [/^expected expression/u, (line) => say('explain.expression', { line })],
  [/^missing terminating/u, (line) => say('explain.quote', { line })],
  [/^expected '\)'/u, (line) => say('explain.paren', { line })],
];

const find = (message: string): Problem | null => {
  const groups = header.exec(message)?.groups;
  if (groups === undefined) {
    return null;
  }
  return { line: groups.line ?? '', text: groups.text ?? '' };
};

const translate = (problem: Problem): string => {
  for (const [pattern, tell] of rules) {
    const match = pattern.exec(problem.text);
    if (match !== null) {
      return tell(problem.line, match.slice(1));
    }
  }
  return say('explain.other', { line: problem.line });
};

const explain = (message: string): string => {
  const problem = find(message);
  if (problem === null) {
    return message;
  }
  return `${translate(problem)}\n\n${say('explain.original')}\n${message.trim()}`;
};

export { explain };
