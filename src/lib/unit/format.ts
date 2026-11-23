interface Beat {
  readonly after?: 'next';
  readonly append?: boolean;
  readonly auto?: number;
  readonly demo?: string;
  readonly expect?: string;
  readonly free?: boolean;
  readonly id: string;
  readonly input?: string;
  readonly keys?: readonly string[];
  readonly lines?: string;
  readonly needs?: 'fullscreen-key';
  readonly say: string;
  readonly snippet?: string;
  readonly stage: 'code' | 'drill' | 'empty' | 'run';
  readonly unlock?: readonly string[];
  readonly wait?: 'drill' | 'run';
  readonly when?: 'fullscreen' | 'windowed';
}

type Line = Omit<Beat, 'say'>;

type Text = Readonly<Record<string, string>>;

interface Shown {
  readonly id: string;
  readonly keys: readonly string[];
  readonly teaches?: readonly string[];
}

interface Task {
  readonly demo: readonly Shown[];
  readonly expect: string;
  readonly goal: string;
  readonly id: string;
  readonly input?: string;
  readonly show: string;
}

interface TaskPart {
  readonly task: Task;
}

type Part = Line | TaskPart;

interface Spoken {
  readonly first: boolean;
  readonly say: string;
  readonly shown: Shown;
}

const fromEnd = -1;
const resetToken = 'reset';
const runToken = 'run';

const isTask = (part: Part): part is TaskPart => 'task' in part;

const said = (text: Text, id: string): string => {
  const sentence = text[id];
  if (sentence === undefined) {
    throw new Error(`no sentence for ${id}`);
  }
  return sentence;
};

const keysOf = (shown: Shown, first: boolean): readonly string[] => {
  if (first) {
    return [resetToken, ...shown.keys];
  }
  return shown.keys;
};

const shownBeat = (task: Task, { first, say, shown }: Spoken): Beat => {
  const beat: Beat = {
    id: shown.id,
    keys: keysOf(shown, first),
    say,
    snippet: task.show,
    stage: 'run',
  };
  if (shown.teaches === undefined) {
    return beat;
  }
  return { ...beat, unlock: shown.teaches };
};

const freeOf = (task: Task): Pick<Beat, 'free'> => {
  if (task.demo.length > 0) {
    return {};
  }
  return { free: true };
};

const gateBeat = (task: Task, say: string): Beat => {
  const beat: Beat = {
    ...freeOf(task),
    expect: task.expect,
    id: task.id,
    say,
    snippet: task.show,
    stage: 'run',
    wait: 'run',
  };
  if (task.input === undefined) {
    return beat;
  }
  return { ...beat, input: task.input };
};

const taskBeats = (task: Task, text: Text): Beat[] => [
  ...task.demo.map((shown, at) =>
    shownBeat(task, { first: at === 0, say: said(text, shown.id), shown }),
  ),
  gateBeat(task, said(text, task.id)),
];

const spoken = (line: Line, say: string): Beat => ({ ...line, say });

const flatten = (parts: readonly Part[], text: Text): Beat[] =>
  parts.flatMap((part) => {
    if (isTask(part)) {
      return taskBeats(part.task, text);
    }
    return [spoken(part, said(text, part.id))];
  });

const tasksOf = (parts: readonly Part[]): Task[] =>
  parts.filter((part) => isTask(part)).map((part) => part.task);

const pathOf = (task: Task): string[] => {
  const keys = task.demo.flatMap((shown) => shown.keys);
  if (keys.length === 0 || keys.at(fromEnd) === runToken) {
    return keys;
  }
  return [...keys, runToken];
};

const indent = '    ';

const mainStart = 'int main()';
const closer = '}';

const mainCloses = (lines: readonly string[]): boolean => {
  const main = lines.findIndex((line) => line.startsWith(mainStart));
  const last = lines.length - 1;
  const closers = [...lines.entries()].filter(([, line]) => line === closer).map(([at]) => at);
  const hasMain = lines.some((line) => line.startsWith(mainStart));
  return hasMain && closers.at(fromEnd) === last && closers.every((at) => at < main || at === last);
};

const programOf = (starter: string, goal: string): string => {
  const lines = starter.split('\n');
  if (!mainCloses(lines)) {
    throw new Error(
      '起始程式要以 main 結尾：main 之後沒有別的函式，最後一行是單獨的「}」，後面不再換行',
    );
  }
  const body = goal.split('\n').map((line) => `${indent}${line}`);
  return [...lines.slice(0, fromEnd), ...body, ...lines.slice(fromEnd)].join('\n');
};

interface Plan {
  readonly history: readonly string[];
  readonly path: readonly string[];
}

const holds = (task: Task, beat: string): boolean =>
  task.id === beat || task.demo.some((shown) => shown.id === beat);

const planFor = (tasks: readonly Task[], beat: string): Plan | null => {
  const at = tasks.findIndex((task) => holds(task, beat));
  const task = tasks[at];
  if (task === undefined) {
    return null;
  }
  const history = tasks
    .slice(0, at)
    .flatMap((earlier) => pathOf(earlier))
    .filter((token) => token !== runToken);
  return { history, path: pathOf(task) };
};

export {
  flatten,
  pathOf,
  planFor,
  programOf,
  resetToken,
  runToken,
  tasksOf,
  type Beat,
  type Line,
  type Part,
  type Plan,
  type Shown,
  type Task,
  type Text,
};
