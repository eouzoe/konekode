interface Beat {
  readonly after?: 'next';
  readonly append?: boolean;
  readonly auto?: number;
  readonly demo?: string;
  readonly expect?: string;
  readonly id: string;
  readonly input?: string;
  readonly keys?: readonly string[];
  readonly lines?: string;
  readonly say: string;
  readonly snippet?: string;
  readonly stage: 'code' | 'drill' | 'empty' | 'run';
  readonly unlock?: readonly string[];
  readonly wait?: 'drill' | 'run';
  readonly when?: 'fullscreen' | 'windowed';
}

interface Shown {
  readonly id: string;
  readonly keys: readonly string[];
  readonly say: string;
  readonly teaches?: readonly string[];
}

interface Task {
  readonly ask: string;
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

type Part = Beat | TaskPart;

const fromEnd = -1;
const resetToken = 'reset';
const runToken = 'run';

const isTask = (part: Part): part is TaskPart => 'task' in part;

const keysOf = (shown: Shown, first: boolean): readonly string[] => {
  if (first) {
    return [resetToken, ...shown.keys];
  }
  return shown.keys;
};

const shownBeat = (task: Task, shown: Shown, first: boolean): Beat => {
  const beat: Beat = {
    id: shown.id,
    keys: keysOf(shown, first),
    say: shown.say,
    snippet: task.show,
    stage: 'run',
  };
  if (shown.teaches === undefined) {
    return beat;
  }
  return { ...beat, unlock: shown.teaches };
};

const gateBeat = (task: Task): Beat => {
  const beat: Beat = {
    expect: task.expect,
    id: task.id,
    say: task.ask,
    snippet: task.show,
    stage: 'run',
    wait: 'run',
  };
  if (task.input === undefined) {
    return beat;
  }
  return { ...beat, input: task.input };
};

const taskBeats = (task: Task): Beat[] => [
  ...task.demo.map((shown, at) => shownBeat(task, shown, at === 0)),
  gateBeat(task),
];

const flatten = (parts: readonly Part[]): Beat[] =>
  parts.flatMap((part) => {
    if (isTask(part)) {
      return taskBeats(part.task);
    }
    return [part];
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

const programOf = (starter: string, goal: string): string => {
  const lines = starter.split('\n');
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
  type Part,
  type Plan,
  type Shown,
  type Task,
};
