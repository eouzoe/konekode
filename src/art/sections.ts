import { beats } from './unit';

interface Section {
  readonly id: string;
  readonly number: string;
  readonly title: string;
}

const sections: readonly Section[] = [
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

export { sectionAt, type Section };
