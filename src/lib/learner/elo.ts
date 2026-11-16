interface Rating {
  readonly count: number;
  readonly value: number;
}

interface Match {
  readonly item: Rating;
  readonly learner: Rating;
}

const steepness = 1;
const startScale = 1;
const decay = 0.05;
const fresh: Rating = { count: 0, value: 0 };

const expected = (learner: number, item: number): number =>
  1 / (1 + Math.exp(-steepness * (learner - item)));

const uncertainty = (count: number): number => startScale / (1 + decay * count);

const moved = (rating: Rating, change: number): Rating => ({
  count: rating.count + 1,
  value: rating.value + uncertainty(rating.count) * change,
});

const update = ({ item, learner }: Match, right: boolean): Match => {
  const surprise = Number(right) - expected(learner.value, item.value);
  return { item: moved(item, -surprise), learner: moved(learner, surprise) };
};

export { expected, fresh, uncertainty, update, type Match, type Rating };
