interface Drill {
  readonly mistakes: number;
  readonly target: string;
  readonly typed: string;
}

const beforeLast = -1;

const indentAt = (target: string, start: number): string => {
  let end = start;
  while (target.charAt(end) === ' ') {
    end += 1;
  }
  return target.slice(start, end);
};

const createDrill = (target: string): Drill => ({
  mistakes: 0,
  target,
  typed: indentAt(target, 0),
});

const expectedChar = (drill: Drill): string => drill.target.charAt(drill.typed.length);

const isDone = (drill: Drill): boolean => drill.typed === drill.target;

const isFull = (drill: Drill): boolean => drill.typed.length >= drill.target.length;

const firstError = (drill: Drill): number => {
  for (let index = 0; index < drill.typed.length; index += 1) {
    if (drill.typed.charAt(index) !== drill.target.charAt(index)) {
      return index;
    }
  }
  return drill.typed.length;
};

const hasError = (drill: Drill): boolean => firstError(drill) < drill.typed.length;

const press = (drill: Drill, input: string): Drill => {
  if (isFull(drill)) {
    return drill;
  }
  const expected = expectedChar(drill);
  const typed = drill.typed + input;
  if (input !== expected) {
    return { ...drill, mistakes: drill.mistakes + 1, typed };
  }
  if (input === '\n' && !hasError(drill)) {
    return { ...drill, typed: typed + indentAt(drill.target, typed.length) };
  }
  return { ...drill, typed };
};

const lineStart = (text: string): number => text.lastIndexOf('\n') + 1;

const erase = (drill: Drill): Drill => {
  const floor = indentAt(drill.target, 0).length;
  if (drill.typed.length <= floor) {
    return drill;
  }
  const start = lineStart(drill.typed);
  const line = drill.typed.slice(start);
  const isIndent = line !== '' && line.trim() === '' && start > 0;
  if (isIndent && line === indentAt(drill.target, start)) {
    return { ...drill, typed: drill.typed.slice(0, start - 1) };
  }
  return { ...drill, typed: drill.typed.slice(0, beforeLast) };
};

export {
  createDrill,
  erase,
  expectedChar,
  firstError,
  hasError,
  indentAt,
  isDone,
  press,
  type Drill,
};
