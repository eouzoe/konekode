import { engine } from '@/lib/complete/current';
import { onRecorded } from '@/lib/record/current';
import { ui } from '@/lib/text/ui';
import { beatsOf } from '@/units/index';

interface Keys {
  readonly show: (next: string, mode: string) => void;
}

interface State {
  fresh: boolean;
  mode: string;
  next: string;
}

const prefix = 'key.';

const orderOf = (unit: string): string[] => {
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

const forget = (present: ReadonlyMap<string, HTMLElement>, learned: readonly string[]): void => {
  for (const [key, element] of present) {
    if (!learned.includes(key)) {
      element.remove();
    }
  }
};

const added = (row: HTMLElement, key: string, fresh: boolean): HTMLElement => {
  const element = cap(key, fresh);
  row.append(element);
  return element;
};

const draw = (row: HTMLElement, order: readonly string[], state: State): void => {
  const learned = order.filter((key) => engine.keys().has(key));
  const present = capsOf(row);
  labelled(row);
  forget(present, learned);
  for (const key of learned) {
    const element = present.get(key) ?? added(row, key, state.fresh);
    element.dataset.next = String(key === state.next);
  }
  row.hidden = learned.length === 0;
  row.dataset.mode = state.mode;
};

const createKeys = (row: HTMLElement, unit: string): Keys => {
  const order = orderOf(unit);
  const state: State = { fresh: false, mode: 'normal', next: '' };
  onRecorded((event) => {
    if (event.kind === 'item.unlocked') {
      queueMicrotask(() => {
        state.fresh = true;
        draw(row, order, state);
        state.fresh = false;
      });
    }
  });
  draw(row, order, state);
  return {
    show: (next, mode) => {
      Object.assign(state, { mode, next });
      draw(row, order, state);
    },
  };
};

export { createKeys, type Keys };
