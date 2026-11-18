import { Rating } from 'ts-fsrs';
import { FSRS7Algorithm, FSRS7_DEFAULT_WEIGHTS, FSRS7_MODEL_BOUNDS } from 'ts-fsrs/models/fsrs-7';

type Evidence = 'helped' | 'unaided' | 'wrong';

interface Memory {
  readonly at: number;
  readonly difficulty: number;
  readonly stability: number;
  readonly stabilityFast: number;
}

const dayLength = 86_400_000;
const wantedRecall = 0.9;

const grades: Readonly<Record<Evidence, number>> = {
  helped: Rating.Hard,
  unaided: Rating.Good,
  wrong: Rating.Again,
};

const algorithm = new FSRS7Algorithm(FSRS7_DEFAULT_WEIGHTS, FSRS7_MODEL_BOUNDS);

const daysSince = (memory: Memory | null, at: number): number => {
  if (memory === null) {
    return 0;
  }
  return Math.max(0, at - memory.at) / dayLength;
};

const remember = (memory: Memory | null, at: number, evidence: Evidence): Memory => {
  const next = algorithm.next_state(memory, daysSince(memory, at), grades[evidence]);
  return {
    at,
    difficulty: next.difficulty,
    stability: next.stability,
    stabilityFast: next.stabilityFast,
  };
};

const recall = (memory: Memory, at: number): number =>
  algorithm.curve(daysSince(memory, at), memory).retrievability;

const dueAt = (memory: Memory): number =>
  memory.at + Math.ceil(algorithm.next_interval(memory, wantedRecall) * dayLength);

export { dayLength, dueAt, recall, remember, wantedRecall, type Evidence, type Memory };
