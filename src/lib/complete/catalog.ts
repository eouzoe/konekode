type Where = 'anywhere' | 'include-line';

interface PairItem {
  readonly close: string;
  readonly id: string;
  readonly kind: 'pair';
  readonly open: string;
  readonly where: Where;
}

type Item = PairItem;

const catalog: readonly Item[] = [
  { close: ')', id: 'pair.paren', kind: 'pair', open: '(', where: 'anywhere' },
  { close: '}', id: 'pair.brace', kind: 'pair', open: '{', where: 'anywhere' },
  { close: '>', id: 'pair.include-angle', kind: 'pair', open: '<', where: 'include-line' },
  { close: "'", id: 'pair.quote', kind: 'pair', open: "'", where: 'anywhere' },
];

export { catalog, type Item, type PairItem, type Where };
