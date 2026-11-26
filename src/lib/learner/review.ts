import { dayLength, dueAt, recall } from './memory';

import type { Component, Model } from './model';

interface Recollection {
  readonly daysLeft: number;
  readonly recall: number;
}

const dueOf = (model: Model, at: number): Array<[string, number]> =>
  [...model].flatMap(([id, { memory }]): Array<[string, number]> => {
    if (memory === null || dueAt(memory) > at) {
      return [];
    }
    return [[id, dueAt(memory)]];
  });

const reviewDue = (model: Model, at: number): ReadonlyArray<string> =>
  dueOf(model, at)
    .toSorted(([first, firstDue], [second, secondDue]) => {
      if (firstDue !== secondDue) {
        return firstDue - secondDue;
      }
      return first.localeCompare(second);
    })
    .map(([id]) => id);

const recollect = ({ memory }: Component, at: number): Recollection | null => {
  if (memory === null) {
    return null;
  }
  return { daysLeft: (dueAt(memory) - at) / dayLength, recall: recall(memory, at) };
};

export { recollect, reviewDue, type Recollection };
