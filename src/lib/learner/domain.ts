import { keys } from '@/lib/complete/catalog';
import { expand } from '@/lib/edit/path';
import { insertKey } from '@/lib/typing/drill';
import { pathOf, type Beat, type Task } from '@/lib/unit/format';

interface UnitDomain {
  readonly shows: ReadonlyMap<string, readonly string[]>;
  readonly uses: ReadonlyMap<string, readonly (readonly string[])[]>;
}

interface Content {
  readonly beats: readonly Beat[];
  readonly tasks: readonly Task[];
}

const byKey: ReadonlyMap<string, string> = new Map(keys.map((item) => [item.key, item.id]));
const components: readonly string[] = keys.map((item) => item.id);
const known = new Set(components);

const used = (tokens: readonly string[]): string[][] =>
  expand(tokens).map((step) => {
    const id = byKey.get(step.key);
    if (step.kind !== 'command' || id === undefined) {
      return [];
    }
    return [id];
  });

const shownBy = (beat: Beat): string[] => {
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
