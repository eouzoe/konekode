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

export {
  flatten,
  pathOf,
  resetToken,
  runToken,
  tasksOf,
  type Beat,
  type Part,
  type Shown,
  type Task,
};
