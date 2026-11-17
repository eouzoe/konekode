import { components } from '@/lib/learner/domain';
import { componentOf, learnerModel } from '@/lib/learner/model';
import { unitState } from '@/lib/learner/progress';
import { flushLog, onRecorded, openLog, recorded, track } from '@/lib/record/current';
import { clearDraft } from '@/lib/run/draft';
import { allDomains, beatsOf } from '@/units/index';

import { textEditor } from './edit';
import { jumpTo, skipFrom, type Entry } from './jump';
import { lookButton } from './looks';

const styles = `
.dev-panel { position: fixed; top: 0.5rem; right: 0.5rem; z-index: 50; display: flex; gap: 0.5rem;
  align-items: center; padding: 0.35rem 0.6rem; border: 1px solid var(--line); border-radius: 0.5rem;
  background: var(--panel); color: var(--soft); font-size: 0.8125rem; line-height: 1.4; }
.dev-panel button, .dev-sheet button { padding: 0.2rem 0.6rem; border: 1px solid var(--line);
  border-radius: 0.4rem; background: transparent; color: var(--ink); font: inherit; cursor: pointer; }
.dev-panel code { color: var(--ink); font-family: var(--mono); }
.dev-sheet { width: min(100% - 2rem, 44rem); max-height: 80vh; padding: 1rem; border: 1px solid var(--line);
  border-radius: 0.6rem; background: var(--panel); color: var(--ink); font-size: 0.9375rem; }
.dev-sheet::backdrop { background: rgb(0 0 0 / 60%); }
.dev-sheet ol { margin: 0.75rem 0 0; padding: 0; max-height: 60vh; overflow-y: auto; list-style: none; }
.dev-sheet li button { display: block; width: 100%; margin: 0 0 0.25rem; text-align: left; }
.dev-sheet li button[data-gate='true'] { border-color: var(--accent); }
.dev-sheet li code { margin-right: 0.6rem; color: var(--faint); font-family: var(--mono); }
.dev-sheet textarea { display: block; width: 100%; min-height: 7rem; margin: 0.75rem 0; padding: 0.6rem;
  border: 1px solid var(--line); border-radius: 0.4rem; background: var(--page); color: var(--ink); font: inherit; }
.dev-sheet table { width: 100%; margin-top: 0.75rem; border-collapse: collapse; font-family: var(--mono); }
.dev-sheet th, .dev-sheet td { padding: 0.2rem 0.6rem; border-bottom: 1px solid var(--line); text-align: left; }
`;

const make = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  text = '',
  className = '',
): HTMLElementTagNameMap[Tag] => {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
};

const apply = async (unit: string, entries: readonly Entry[]): Promise<void> => {
  if (entries.length === 0) {
    return;
  }
  for (const entry of entries) {
    track(entry.kind, { data: { dev: true }, ref: entry.ref, unit });
  }
  clearDraft(unit);
  await flushLog();
  globalThis.location.reload();
};

const positionOf = (unit: string): string =>
  unitState(recorded(), unit).position ?? beatsOf(unit)[0]?.id ?? '';

const jumpButton = (unit: string, at: number): HTMLLIElement => {
  const item = make('li');
  const button = make('button');
  const beat = beatsOf(unit)[at];
  if (beat === undefined) {
    return item;
  }
  button.dataset.gate = String(beat.wait !== undefined);
  button.append(make('code', `${String(at + 1)} ${beat.id}`), beat.say);
  button.addEventListener('click', () => {
    void apply(unit, jumpTo(beatsOf(unit), beat.id));
  });
  item.append(button);
  return item;
};

const jumpSheet = (unit: string): HTMLDialogElement => {
  const sheet = make('dialog', '', 'dev-sheet');
  const list = make('ol');
  list.append(...beatsOf(unit).map((_beat, at) => jumpButton(unit, at)));
  sheet.append(make('strong', '跳到哪一句（框起來的是關卡；前面的關卡會算通過）'), list);
  return sheet;
};

const noteSheet = (unit: string): HTMLDialogElement => {
  const sheet = make('dialog', '', 'dev-sheet');
  const where = make('code');
  const field = make('textarea');
  const save = make('button', '記下來');
  save.addEventListener('click', () => {
    const text = field.value.trim();
    if (text !== '') {
      track('dev.note', { data: { text }, ref: positionOf(unit), unit });
      field.value = '';
    }
    sheet.close();
  });
  sheet.addEventListener('toggle', () => {
    where.textContent = positionOf(unit);
  });
  sheet.append(make('strong', '對這一句留話：'), where, field, save);
  return sheet;
};

const standings: Record<string, string> = { done: '自己做過', shown: '看過示範', unseen: '沒看過' };
const columns = [
  '知識點',
  '狀態',
  '看過示範',
  '機會',
  '第一下就對',
  '做到了',
  '最近一次第一下錯',
  'BKT（只記錄）',
];
const marks: Record<string, string> = { false: '', true: '是' };
const digits = 3;

const modelRows = (): HTMLTableRowElement[] => {
  const model = learnerModel(recorded(), allDomains());
  return components.map((id) => {
    const item = componentOf(model, id);
    const row = make('tr');
    const cells = [
      id,
      standings[item.standing],
      item.shown,
      item.opportunities,
      item.firstRight,
      item.completed,
      marks[String(item.unsettled)],
      item.estimate.toFixed(digits),
    ];
    row.append(...cells.map((value) => make('td', String(value))));
    return row;
  });
};

const modelSheet = (): HTMLDialogElement => {
  const sheet = make('dialog', '', 'dev-sheet');
  const head = make('tr');
  const body = make('tbody');
  const table = make('table');
  head.append(...columns.map((text) => make('th', text)));
  table.append(head, body);
  sheet.addEventListener('toggle', () => {
    body.replaceChildren(...modelRows());
  });
  sheet.append(
    make('strong', '學生模型（由事件紀錄算出來；第一版只有指令鍵；BKT 只記錄、不決定任何事）'),
    table,
  );
  return sheet;
};

const opener = (label: string, sheet: HTMLDialogElement): HTMLButtonElement => {
  const button = make('button', label);
  button.addEventListener('click', () => {
    sheet.showModal();
  });
  return button;
};

const skipButton = (unit: string): HTMLButtonElement => {
  const skip = make('button', '略過這一關');
  skip.addEventListener('click', () => {
    void apply(unit, skipFrom(beatsOf(unit), positionOf(unit)));
  });
  return skip;
};

const editButton = (unit: string): HTMLElement[] => {
  const editor = textEditor(unit);
  const button = make('button', '改這句（F2）');
  button.addEventListener('click', editor.open);
  return [button, editor.sheet];
};

const sheets = (unit: string): HTMLElement[] => {
  const jump = jumpSheet(unit);
  const note = noteSheet(unit);
  const model = modelSheet();
  const openers = [opener('跳到…', jump), opener('留話', note), opener('學生模型', model)];
  return [...openers, lookButton(), jump, note, model];
};

const buildPanel = (unit: string): HTMLElement => {
  const panel = make('aside', '', 'dev-panel');
  const where = make('code', positionOf(unit));
  onRecorded((event) => {
    if (event.kind === 'beat.reached' && event.unit === unit) {
      where.textContent = event.ref;
    }
  });
  panel.append('開發模式', where, ...editButton(unit), skipButton(unit), ...sheets(unit));
  return panel;
};

const jumpFromAddress = async (unit: string): Promise<boolean> => {
  const address = new URL(globalThis.location.href);
  const target = address.searchParams.get('at');
  if (target === null) {
    return false;
  }
  address.searchParams.delete('at');
  globalThis.history.replaceState(null, '', address);
  const entries = jumpTo(beatsOf(unit), target);
  await apply(unit, entries);
  return entries.length > 0;
};

const mountDevPanel = async (): Promise<void> => {
  await openLog();
  const unit = document.querySelector<HTMLElement>('[data-scene]')?.dataset.unit;
  if (unit === undefined || (await jumpFromAddress(unit))) {
    return;
  }
  document.head.append(make('style', styles));
  document.body.append(buildPanel(unit));
};

export { mountDevPanel };
