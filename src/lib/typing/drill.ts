interface Drill {
  readonly mistakes: number;
  readonly position: number;
  readonly target: string;
  readonly wrong: boolean;
}

const skipIndent = (target: string, start: number): number => {
  let index = start;
  while (target.charAt(index) === ' ') {
    index += 1;
  }
  return index;
};

const createDrill = (target: string): Drill => ({
  mistakes: 0,
  position: skipIndent(target, 0),
  target,
  wrong: false,
});

const expectedChar = (drill: Drill): string => drill.target.charAt(drill.position);

const isDone = (drill: Drill): boolean => drill.position >= drill.target.length;

const press = (drill: Drill, input: string): Drill => {
  if (isDone(drill)) {
    return drill;
  }
  const expected = expectedChar(drill);
  if (input !== expected) {
    return { ...drill, mistakes: drill.mistakes + 1, wrong: true };
  }
  const next = drill.position + 1;
  if (expected === '\n') {
    return { ...drill, position: skipIndent(drill.target, next), wrong: false };
  }
  return { ...drill, position: next, wrong: false };
};

export { createDrill, expectedChar, isDone, press, type Drill };
