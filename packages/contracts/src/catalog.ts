type Where = 'anywhere' | 'include-line';

interface PairItem {
  readonly close: string;
  readonly id: string;
  readonly kind: 'pair';
  readonly open: string;
  readonly where: Where;
}

interface KeyItem {
  readonly id: string;
  readonly key: string;
  readonly kind: 'key';
}

type Item = KeyItem | PairItem;

const commandKeys = ['$', '.', '0', 'G', 'O', 'd', 'f', 'i', 'j', 'k', 'o', 'x'];

const pairs: ReadonlyArray<PairItem> = [
  { close: ')', id: 'pair.paren', kind: 'pair', open: '(', where: 'anywhere' },
  { close: '}', id: 'pair.brace', kind: 'pair', open: '{', where: 'anywhere' },
  { close: '>', id: 'pair.include-angle', kind: 'pair', open: '<', where: 'include-line' },
];

const keys: ReadonlyArray<KeyItem> = commandKeys.map((key) => ({
  id: `key.${key}`,
  key,
  kind: 'key',
}));

const catalog: ReadonlyArray<Item> = [...pairs, ...keys];

export { catalog, keys, type Item, type KeyItem, type PairItem, type Where };
