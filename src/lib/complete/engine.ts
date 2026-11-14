import { type Item, type PairItem } from './catalog';

interface Engine {
  readonly brackets: () => string[];
  readonly linePair: (open: string) => PairItem | null;
  readonly pairs: () => PairItem[];
}

const createEngine = (items: readonly Item[], unlocked: () => ReadonlySet<string>): Engine => {
  const pairs = (): PairItem[] => {
    const ids = unlocked();
    return items.filter((item) => ids.has(item.id));
  };
  return {
    brackets: () =>
      pairs()
        .filter((pair) => pair.where === 'anywhere')
        .map((pair) => pair.open),
    linePair: (open) =>
      pairs().find((pair) => pair.where === 'include-line' && pair.open === open) ?? null,
    pairs,
  };
};

export { createEngine, type Engine };
