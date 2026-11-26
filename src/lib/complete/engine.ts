import type { Item, PairItem } from './catalog';

interface Engine {
  readonly brackets: () => Array<string>;
  readonly keys: () => ReadonlySet<string>;
  readonly linePair: (open: string) => PairItem | null;
  readonly pairs: () => Array<PairItem>;
}

const createEngine = (items: ReadonlyArray<Item>, unlocked: () => ReadonlySet<string>): Engine => {
  const available = (): Array<Item> => {
    const ids = unlocked();
    return items.filter((item) => ids.has(item.id));
  };
  const pairs = (): Array<PairItem> => available().filter((item) => item.kind === 'pair');
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
