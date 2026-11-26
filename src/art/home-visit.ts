import { array, object, string, type infer as Infer } from '@/lib/zod';

import script from './home-lines.json' with { type: 'json' };
import { indexOf, readProgress, sectionAt, sections, type Section } from './progress';

const lineSchema = object({
  go: string().optional(),
  id: string(),
  mood: string(),
  say: string(),
  show: string().optional(),
});
const scriptSchema = object({ back: array(lineSchema), first: array(lineSchema) });

type Line = Infer<typeof lineSchema>;
type Visit = keyof Infer<typeof scriptSchema>;

const lines = scriptSchema.parse(script);
const params = new URLSearchParams(location.search);
const wire = params.get('look') === 'wire';
const still = params.has('still') || wire;
const progress = readProgress();
const beforeStart = -1;
const firstSection = '01';

const visitOf = (): Visit => {
  const forced = params.get('visit');
  if (forced === 'first' || forced === 'back') {
    return forced;
  }
  if (progress === undefined) {
    return 'first';
  }
  return 'back';
};

const visit = visitOf();

const shownIndexOf = (): number | null => {
  if (visit === 'first') {
    return null;
  }
  return progress?.index ?? indexOf('add-second');
};

const shownIndex = shownIndexOf();

const stepState = (number: string, reached: string): string => {
  if (shownIndex === null && number === firstSection) {
    return 'now';
  }
  if (shownIndex === null) {
    return 'todo';
  }
  if (number > reached) {
    return 'todo';
  }
  if (number === reached) {
    return 'now';
  }
  return 'done';
};

const shownSection = (): Section => sectionAt(shownIndex ?? beforeStart);

const fillRoute = (steps: HTMLElement): void => {
  const reached = shownSection().number;
  for (const { number, title } of sections) {
    const item = document.createElement('li');
    item.className = `step ${stepState(number, reached)}`;
    const label = document.createElement('b');
    label.textContent = number;
    const name = document.createElement('span');
    name.textContent = title;
    item.append(label, name);
    steps.append(item);
  }
};

const fillText = (text: string): string => text.replace('{section}', shownSection().title);

const shownLines = (): ReadonlyArray<Line> => lines[visit];

const stopAt = (): number => Number(params.get('line') ?? shownLines().length);

const targetOf = (go: string): string => {
  if (go === 'continue') {
    return `/art/unit?at=${String(shownIndex ?? 0)}`;
  }
  return '/art/unit';
};

export { fillRoute, fillText, shownLines, still, stopAt, targetOf, wire, type Line };
