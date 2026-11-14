import { type BeatMeta, type Check, type When } from './machine';

const checks: ReadonlySet<string> = new Set(['drill', 'run']);
const conditions: ReadonlySet<string> = new Set(['fullscreen', 'windowed']);

const isCheck = (value: string): value is Check => checks.has(value);
const isWhen = (value: string): value is When => conditions.has(value);

const readMeta = (beat: HTMLElement): BeatMeta => {
  const { after, expect, id = '', wait = '', when = '' } = beat.dataset;
  let check: Check = '';
  if (isCheck(wait)) {
    check = wait;
  }
  let condition: When = '';
  if (isWhen(when)) {
    condition = when;
  }
  return { expect: expect ?? null, id, next: after === 'next', wait: check, when: condition };
};

export { readMeta };
