import { units } from '@konekode/course/units';

import { unitDomain, type UnitDomain } from './domain';

const allDomains = (): Readonly<Record<string, UnitDomain>> =>
  Object.fromEntries(Object.entries(units).map(([name, unit]) => [name, unitDomain(unit)]));

let domains: Readonly<Record<string, UnitDomain>> | null = null;

const domainOf = (unit: string): UnitDomain | undefined => {
  domains ??= allDomains();
  return domains[unit];
};

const usedAt = (unit: string, beat: string, step: number): ReadonlyArray<string> =>
  domainOf(unit)?.uses.get(beat)?.[step] ?? [];

const shownAt = (unit: string, beat: string): ReadonlyArray<string> =>
  domainOf(unit)?.shows.get(beat) ?? [];

export { allDomains, shownAt, usedAt };
