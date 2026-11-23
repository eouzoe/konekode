import { array, boolean, int, object, string, type infer as Infer } from '@/lib/zod';

interface Step {
  readonly auto?: number;
  readonly free?: boolean;
  readonly say: string;
  readonly stage: string;
  readonly wait?: string;
}

interface Rule {
  readonly bytes: number;
  readonly early: boolean;
  readonly gate: boolean;
  readonly lead: number;
  readonly name: string;
  readonly wants: (step: Step) => boolean;
}

const dueSchema = object({
  by: int(),
  bytes: int(),
  early: boolean(),
  gate: boolean(),
  name: string(),
});
const duesSchema = array(dueSchema);

type Due = Infer<typeof dueSchema>;

const missing = -1;

const dueAt = (steps: readonly Step[], rule: Rule): number => {
  const wanted = steps.findIndex((step) => rule.wants(step));
  if (wanted === missing) {
    return wanted;
  }
  return Math.max(wanted - rule.lead, 0);
};

const dues = (steps: readonly Step[], rules: readonly Rule[]): Due[] =>
  rules
    .map((rule) => ({
      by: dueAt(steps, rule),
      bytes: rule.bytes,
      early: rule.early,
      gate: rule.gate,
      name: rule.name,
    }))
    .filter((due) => due.by >= 0)
    .toSorted((left, right) => left.by - right.by);

const readDues = (raw: string | undefined): Due[] => {
  if (raw === undefined || raw === '') {
    return [];
  }
  const value: unknown = JSON.parse(raw);
  return duesSchema.parse(value);
};

const pace = { floorMs: 1500, graphemeMs: 30, leadMs: 8000 };

const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });

const graphemes = (text: string): number => [...segmenter.segment(text)].length;

const readingMs = (step: Step): number =>
  Math.max(pace.floorMs, graphemes(step.say) * pace.graphemeMs) + (step.auto ?? 0);

const msBetween = (steps: readonly Step[], from: number, to: number): number =>
  steps.slice(Math.max(from, 0), Math.max(to, 0)).reduce((sum, step) => sum + readingMs(step), 0);

interface Link {
  readonly bitsPerMs: number;
  readonly latencyMs: number;
}

const bitsPerByte = 8;
const margin = 2;

const downloadMs = (bytes: number, link: Link): number =>
  margin * ((bytes * bitsPerByte) / link.bitsPerMs + link.latencyMs);

interface Moment {
  readonly at: number;
  readonly due: Due;
  readonly link: Link;
  readonly steps: readonly Step[];
}

const timeToStart = ({ at, due, link, steps }: Moment): boolean =>
  due.by <= at ||
  (due.early && msBetween(steps, at, due.by) <= Math.max(pace.leadMs, downloadMs(due.bytes, link)));

const overdue = (dueList: readonly Due[], at: number): Due[] =>
  dueList.filter((due) => due.gate && due.by <= at);

export {
  downloadMs,
  dues,
  msBetween,
  overdue,
  readDues,
  readingMs,
  timeToStart,
  type Due,
  type Link,
  type Rule,
  type Step,
};
