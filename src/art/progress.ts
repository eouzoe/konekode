import { int, number, object, string, type infer as Infer } from '@/lib/zod';

import { beats } from './unit';

interface Section {
  readonly id: string;
  readonly number: string;
  readonly title: string;
}

const sections: ReadonlyArray<Section> = [
  { id: 'see-template', number: '01', title: '程式的樣子' },
  { id: 'demo-intro', number: '02', title: 'vim 練習' },
  { id: 'do-things', number: '03', title: '輸出' },
  { id: 'add-second', number: '04', title: '換行' },
  { id: 'remember-number', number: '05', title: '變數' },
  { id: 'listen', number: '06', title: '輸入' },
  { id: 'recap', number: '07', title: '自己寫' },
];

const opening: Section = { id: '', number: '00', title: '起步' };

const sectionAt = (index: number): Section =>
  beats
    .slice(0, index + 1)
    .map((beat) => sections.find((section) => section.id === beat.id))
    .findLast((section) => section !== undefined) ?? opening;

const progressSchema = object({ at: number(), id: string(), index: int() });
type Progress = Infer<typeof progressSchema>;

const storageKey = 'konekode-art-progress';

const saveProgress = (index: number): void => {
  const beat = beats[index];
  if (beat === undefined) {
    return;
  }
  try {
    localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), id: beat.id, index }));
  } catch {
    globalThis.reportError(new Error('art progress could not be saved'));
  }
};

const readProgress = (): Progress | undefined => {
  try {
    const parsed = progressSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? 'null'));
    if (parsed.success) {
      return parsed.data;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

const indexOf = (id: string): number => beats.findIndex((beat) => beat.id === id);

export { indexOf, readProgress, saveProgress, sectionAt, sections, type Progress, type Section };
