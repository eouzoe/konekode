import { type UnitDomain } from './domain';

interface Count {
  legacy: number;
  unread: number;
}

type LookUp = () => readonly string[] | undefined;

const listed = (value: unknown): readonly string[] | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return value.split(',').filter((id) => id !== '');
};

const described = (count: Count, own: unknown, lookUp: LookUp): readonly string[] => {
  const told = listed(own);
  if (told !== null) {
    return told;
  }
  const found = lookUp();
  if (found === undefined) {
    count.unread += 1;
    return [];
  }
  count.legacy += 1;
  return found;
};

const shownBy = (domain: UnitDomain | undefined, beat: string): readonly string[] | undefined => {
  if (domain === undefined) {
    return undefined;
  }
  return domain.shows.get(beat) ?? [];
};

const usedBy = (
  domain: UnitDomain | undefined,
  task: string,
  step: number,
): readonly string[] | undefined => {
  if (domain === undefined) {
    return undefined;
  }
  return domain.uses.get(task)?.[step] ?? [];
};

export { described, shownBy, usedBy, type Count };
