import { ui } from '@konekode/course/ui';
import { beatsOf } from '@konekode/course/units';

import { engine } from '@/lib/complete/current';
import { onRecorded } from '@/lib/record/current';

interface Keys {
  readonly nudge: () => void;
  readonly show: (next: string, mode: string) => void;
}

interface State {
  readonly fresh: Set<string>;
  mode: string;
  next: string;
}

const prefix = 'key.';

const orderOf = (unit: string): Array<string> => {
  const ids = beatsOf(unit).flatMap((beat) => beat.unlock ?? []);
  const keys = ids.filter((id) => id.startsWith(prefix)).map((id) => id.slice(prefix.length));
  return [...new Set(keys)];
};

const capsOf = (row: HTMLElement): Map<string, HTMLElement> =>
  new Map(
    [...row.querySelectorAll<HTMLElement>('kbd')].map((element) => [
      element.dataset.key ?? '',
      element,
    ]),
  );

const cap = (key: string, fresh: boolean): HTMLElement => {
  const element = document.createElement('kbd');
  element.textContent = key;
  Object.assign(element.dataset, { fresh: String(fresh), key });
  return element;
};

const labelled = (row: HTMLElement): void => {
  if (row.querySelector('span') === null) {
    const label = document.createElement('span');
    label.textContent = ui['run.myKeys'];
    row.append(label);
  }
};

const forget = (
  present: ReadonlyMap<string, HTMLElement>,
  learned: ReadonlyArray<string>,
): void => {
  for (const [key, element] of present) {
    if (!learned.includes(key)) {
      element.remove();
    }
  }
};

const added = (row: HTMLElement, key: string, state: State): HTMLElement => {
  const element = cap(key, state.fresh.has(key));
  state.fresh.delete(key);
  row.append(element);
  return element;
};

const draw = (row: HTMLElement, order: ReadonlyArray<string>, state: State): void => {
  const learned = order.filter((key) => engine.keys().has(key));
  const present = capsOf(row);
  labelled(row);
  forget(present, learned);
  for (const key of learned) {
    const element = present.get(key) ?? added(row, key, state);
    element.dataset.next = String(key === state.next);
  }
  row.hidden = learned.length === 0;
  row.dataset.mode = state.mode;
};

const shake = [
  { transform: 'translateX(0)' },
  { offset: 0.25, transform: 'translateX(-5px)' },
  { offset: 0.75, transform: 'translateX(5px)' },
  { transform: 'translateX(0)' },
];
const shakeTime = 320;

const nudge = (row: HTMLElement): void => {
  const still = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const next = row.querySelector<HTMLElement>('kbd[data-next="true"]');
  if (!still && next !== null) {
    next.animate(shake, { duration: shakeTime });
  }
};

const createKeys = (row: HTMLElement, unit: string): Keys => {
  const order = orderOf(unit);
  const state: State = { fresh: new Set(), mode: 'normal', next: '' };
  onRecorded((event) => {
    if (event.kind === 'item.unlocked' && event.ref.startsWith(prefix)) {
      state.fresh.add(event.ref.slice(prefix.length));
      queueMicrotask(() => {
        draw(row, order, state);
      });
    }
  });
  draw(row, order, state);
  return {
    nudge: () => {
      nudge(row);
    },
    show: (next, mode) => {
      Object.assign(state, { mode, next });
      draw(row, order, state);
    },
  };
};

export { createKeys, type Keys };
