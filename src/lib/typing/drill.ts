type Mode = 'insert' | 'normal';

type Feedback = 'ime' | 'need-insert' | 'no-delete' | 'none' | 'wrong-key';

interface Drill {
  readonly feedback: Feedback;
  readonly mistakes: number;
  readonly mode: Mode;
  readonly position: number;
  readonly target: string;
}

const insertKey = 'i';

const skipIndent = (target: string, start: number): number => {
  let index = start;
  while (target.charAt(index) === ' ') {
    index += 1;
  }
  return index;
};

const createDrill = (target: string): Drill => ({
  feedback: 'none',
  mistakes: 0,
  mode: 'normal',
  position: skipIndent(target, 0),
  target,
});

const expectedChar = (drill: Drill): string => drill.target.charAt(drill.position);

const isTyped = (drill: Drill): boolean => drill.position >= drill.target.length;

const isDone = (drill: Drill): boolean => isTyped(drill) && drill.mode === 'normal';

const hasStarted = (drill: Drill): boolean => drill.position > skipIndent(drill.target, 0);

const command = (drill: Drill, input: string): Drill => {
  if (isTyped(drill)) {
    return drill;
  }
  if (input === insertKey) {
    return { ...drill, feedback: 'none', mode: 'insert' };
  }
  return { ...drill, feedback: 'need-insert' };
};

const insert = (drill: Drill, input: string): Drill => {
  const expected = expectedChar(drill);
  if (isTyped(drill) || input !== expected) {
    return { ...drill, feedback: 'wrong-key', mistakes: drill.mistakes + 1 };
  }
  const next = drill.position + 1;
  if (expected === '\n') {
    return { ...drill, feedback: 'none', position: skipIndent(drill.target, next) };
  }
  return { ...drill, feedback: 'none', position: next };
};

const press = (drill: Drill, input: string): Drill => {
  if (drill.mode === 'normal') {
    return command(drill, input);
  }
  return insert(drill, input);
};

const escape = (drill: Drill): Drill => ({ ...drill, feedback: 'none', mode: 'normal' });

const remind = (drill: Drill, feedback: Feedback): Drill => {
  if (isDone(drill)) {
    return drill;
  }
  return { ...drill, feedback };
};

export {
  createDrill,
  escape,
  expectedChar,
  hasStarted,
  insertKey,
  isDone,
  isTyped,
  press,
  remind,
  type Drill,
  type Feedback,
  type Mode,
};
