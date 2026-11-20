interface Counted {
  readonly count: number;
  readonly kind: string;
  readonly where: string;
}

type Tally = Map<string, Map<string, number>>;

const countOf = (tally: Tally, kind: string, where: string): number =>
  tally.get(kind)?.get(where) ?? 0;

const setCount = (tally: Tally, { count, kind, where }: Counted): void => {
  const places = tally.get(kind) ?? new Map<string, number>();
  places.set(where, count);
  tally.set(kind, places);
};

const bump = (tally: Tally, kind: string, where: string): number => {
  const count = countOf(tally, kind, where) + 1;
  setCount(tally, { count, kind, where });
  return count;
};

const counted = (tally: Tally): Counted[] =>
  [...tally.entries()].flatMap(([kind, places]) =>
    [...places.entries()].map(([where, count]) => ({ count, kind, where })),
  );

export { bump, counted, countOf, setCount, type Counted, type Tally };
