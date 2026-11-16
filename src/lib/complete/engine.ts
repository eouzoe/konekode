import { type Item, type PairItem } from './catalog';

interface Engine {
  readonly brackets: () => string[];
  readonly keys: () => ReadonlySet<string>;
  readonly linePair: (open: string) => PairItem | null;
  readonly pairs: () => PairItem[];
}

const createEngine = (items: readonly Item[], unlocked: () => ReadonlySet<string>): Engine => {
  const available = (): Item[] => {
    const ids = unlocked();
    return items.filter((item) => ids.has(item.id));
  };
  const pairs = (): PairItem[] => available().filter((item) => item.kind === 'pair');
  return {
    brackets: () =>
      pairs()
        .filter((pair) => pair.where === 'anywhere')
        .map((pair) => pair.open),
    keys: () =>
      new Set(
        available()
          .filter((item) => item.kind === 'key')
          .map((item) => item.key),
      ),
    linePair: (open) =>
      pairs().find((pair) => pair.where === 'include-line' && pair.open === open) ?? null,
    pairs,
  };
};

export { createEngine, type Engine };
