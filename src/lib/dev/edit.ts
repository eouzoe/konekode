import { beatsOf } from '@/units/index';

interface Parts {
  readonly field: HTMLTextAreaElement;
  readonly sheet: HTMLDialogElement;
  readonly status: HTMLElement;
  readonly where: HTMLElement;
}

const route = '/__text';
const editKey = 'F2';
const reloadAfter = 600;
const last = -1;

const currentBeat = (): string => {
  const shown = document.querySelectorAll<HTMLElement>('[data-scene] [data-beat]:not([hidden])');
  return [...shown].at(last)?.dataset.id ?? '';
};

const send = async (unit: string, id: string, text: string): Promise<string> => {
  try {
    const response = await fetch(route, {
      body: JSON.stringify({ id, locale: document.documentElement.lang, text, unit }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (response.ok) {
      return '';
    }
    return `存不了：${await response.text()}`;
  } catch {
    return '存不了：連不到開發伺服器';
  }
};

const build = (): Parts => {
  const sheet = document.createElement('dialog');
  const where = document.createElement('code');
  const field = document.createElement('textarea');
  const status = document.createElement('p');
  const hint = document.createElement('p');
  sheet.className = 'dev-sheet';
  field.rows = 3;
  hint.textContent = 'Enter 存檔，Esc 取消';
  sheet.append(where, field, hint, status);
  return { field, sheet, status, where };
};

const open = (parts: Parts, unit: string): void => {
  const id = currentBeat();
  const beat = beatsOf(unit).find((other) => other.id === id);
  if (beat === undefined || parts.sheet.open) {
    return;
  }
  parts.where.textContent = id;
  parts.field.value = beat.say;
  parts.status.textContent = '';
  parts.sheet.showModal();
  parts.field.select();
};

const save = async (parts: Parts, unit: string): Promise<void> => {
  const text = parts.field.value.trim();
  const problem = await send(unit, parts.where.textContent, text);
  if (problem !== '') {
    parts.status.textContent = problem;
    return;
  }
  parts.status.textContent = '已存檔';
  setTimeout(() => {
    globalThis.location.reload();
  }, reloadAfter);
};

const textEditor = (unit: string): { open: () => void; sheet: HTMLDialogElement } => {
  const parts = build();
  parts.field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      void save(parts, unit);
    }
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === editKey) {
        event.preventDefault();
        open(parts, unit);
      }
    },
    { capture: true },
  );
  return {
    open: () => {
      open(parts, unit);
    },
    sheet: parts.sheet,
  };
};

export { textEditor };
