interface Account {
  readonly day: string;
  readonly network: string;
}

interface Usage {
  readonly batches: number;
  readonly bytes: number;
}

const dayLimits: Usage = { batches: 8000, bytes: 64_000_000 };
const groups = 8;
const prefixGroups = 4;
const hex = 16;
const dayLength = 10;

const readUsage = 'SELECT bytes, batches FROM intake_usage WHERE network = ? AND day = ?';
const addUsage = `INSERT INTO intake_usage (network, day, bytes, batches) VALUES (?, ?, ?, 1)
ON CONFLICT (network, day) DO UPDATE SET bytes = bytes + excluded.bytes, batches = batches + 1`;

const parts = (text: string): string[] => text.split(':').filter((part) => part !== '');

const expand = (ip: string): string[] => {
  const [head = '', tail] = ip.split('::');
  if (tail === undefined) {
    return parts(head);
  }
  const left = parts(head);
  const right = parts(tail);
  const missing = Math.max(groups - left.length - right.length, 0);
  return [...left, ...Array.from({ length: missing }, () => '0'), ...right];
};

const networkOf = (ip: string): string => {
  if (!ip.includes(':')) {
    return ip;
  }
  const prefix = expand(ip)
    .slice(0, prefixGroups)
    .map((part) => Number.parseInt(part, hex).toString(hex));
  return `${prefix.join(':')}::/64`;
};

const accountOf = (ip: string, now: number): Account => ({
  day: new Date(now).toISOString().slice(0, dayLength),
  network: networkOf(ip),
});

const amount = (row: object, name: string): number => {
  const value: unknown = Reflect.get(row, name);
  if (typeof value !== 'number') {
    return 0;
  }
  return value;
};

const usageOf = (row: unknown): Usage => {
  if (typeof row !== 'object' || row === null) {
    return { batches: 0, bytes: 0 };
  }
  return { batches: amount(row, 'batches'), bytes: amount(row, 'bytes') };
};

const hasRoom = (used: Usage, size: number, limits: Usage = dayLimits): boolean =>
  used.batches < limits.batches && used.bytes + size <= limits.bytes;

export { accountOf, addUsage, dayLimits, hasRoom, networkOf, readUsage, usageOf, type Account };
