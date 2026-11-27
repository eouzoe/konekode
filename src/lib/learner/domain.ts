import { keys } from '@konekode/contracts/catalog';
import { pathOf, type Beat, type Task } from '@konekode/contracts/unit';

import { expand } from '@/lib/edit/path';
import { insertKey } from '@/lib/typing/drill';

interface UnitDomain {
  readonly shows: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly uses: ReadonlyMap<string, ReadonlyArray<ReadonlyArray<string>>>;
}

interface Content {
  readonly beats: ReadonlyArray<Beat>;
  readonly tasks: ReadonlyArray<Task>;
}

const byKey: ReadonlyMap<string, string> = new Map(keys.map((item) => [item.key, item.id]));
const components: ReadonlyArray<string> = keys.map((item) => item.id);
const known = new Set(components);

const used = (tokens: ReadonlyArray<string>): Array<Array<string>> =>
  expand(tokens).map((step) => {
    const id = byKey.get(step.key);
    if (step.kind !== 'command' || id === undefined) {
      return [];
    }
    return [id];
  });

const shownBy = (beat: Beat): Array<string> => {
  const labelled = (beat.unlock ?? []).filter((id) => known.has(id));
  return [...new Set([...labelled, ...used(beat.keys ?? []).flat()])];
};

const drillUses = used([insertKey]);

const unitDomain = ({ beats, tasks }: Content): UnitDomain => ({
  shows: new Map(beats.map((beat) => [beat.id, shownBy(beat)])),
  uses: new Map([
    ...beats.filter((beat) => beat.wait === 'drill').map((beat) => [beat.id, drillUses] as const),
    ...tasks.map((task) => [task.id, used(pathOf(task))] as const),
  ]),
});

export { components, unitDomain, type UnitDomain };
