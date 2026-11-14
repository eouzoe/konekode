interface Problem {
  readonly line: string;
  readonly text: string;
}

type Rule = readonly [pattern: RegExp, say: (line: string, found: readonly string[]) => string];

const header = /main\.cpp:(?<line>\d+):\d+: (?:fatal )?error: (?<text>.+)/u;

const rules: readonly Rule[] = [
  [/^expected ';'/u, (line) => `第 ${line} 行的最後面少了分號 ;`],
  [
    /^use of undeclared identifier '(?<name>[^']+)'; did you mean '(?<guess>[^']+)'/u,
    (line, [name = '', guess = '']) =>
      `第 ${line} 行的 ${name}，電腦不認識這個名字。是不是想打 ${guess}？`,
  ],
  [
    /^use of undeclared identifier '(?<name>[^']+)'/u,
    (line, [name = '']) =>
      `第 ${line} 行的 ${name}，電腦不認識這個名字。請檢查有沒有打錯字，或是還沒有先宣告它。`,
  ],
  [
    /^unknown type name '(?<name>[^']+)'/u,
    (line, [name = '']) => `第 ${line} 行的 ${name}，電腦不認識。請檢查有沒有打錯字。`,
  ],
  [
    /^invalid operands to binary expression/u,
    (line) => `第 ${line} 行的箭頭方向可能反了。cout 要用 <<，cin 要用 >>。`,
  ],
  [/^expected '\}'/u, () => '少了一個右大括號 }。'],
  [/^extraneous closing brace/u, (line) => `第 ${line} 行多了一個右大括號 }。`],
  [/^expected expression/u, (line) => `第 ${line} 行有一個地方只寫到一半。`],
  [/^missing terminating/u, (line) => `第 ${line} 行的引號沒有成對。`],
  [/^expected '\)'/u, (line) => `第 ${line} 行少了一個右括號 )。`],
];

const find = (message: string): Problem | null => {
  const groups = header.exec(message)?.groups;
  if (groups === undefined) {
    return null;
  }
  return { line: groups.line ?? '', text: groups.text ?? '' };
};

const translate = (problem: Problem): string => {
  for (const [pattern, say] of rules) {
    const match = pattern.exec(problem.text);
    if (match !== null) {
      return say(problem.line, match.slice(1));
    }
  }
  return `第 ${problem.line} 行有電腦看不懂的地方。`;
};

const explain = (message: string): string => {
  const problem = find(message);
  if (problem === null) {
    return message;
  }
  return `${translate(problem)}\n\n編譯器的原始訊息：\n${message.trim()}`;
};

export { explain };
