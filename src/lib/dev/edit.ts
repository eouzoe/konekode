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

interface Target {
  readonly id: string;
  readonly text: string;
  readonly unit: string;
}

const openFor = (parts: Parts, target: Target): void => {
  if (parts.sheet.open) {
    return;
  }
  parts.sheet.dataset.unit = target.unit;
  parts.where.textContent = target.id;
  parts.field.value = target.text;
  parts.status.textContent = '';
  parts.sheet.showModal();
  parts.field.select();
};

const open = (parts: Parts, unit: string): void => {
  const id = currentBeat();
  const beat = beatsOf(unit).find((other) => other.id === id);
  if (beat !== undefined) {
    openFor(parts, { id, text: beat.say, unit });
  }
};

const save = async (parts: Parts): Promise<void> => {
  const text = parts.field.value.trim();
  const problem = await send(parts.sheet.dataset.unit ?? '', parts.where.textContent, text);
  if (problem !== '') {
    parts.status.textContent = problem;
    return;
  }
  parts.status.textContent = '已存檔';
  setTimeout(() => {
    globalThis.location.reload();
  }, reloadAfter);
};

interface Editor {
  readonly open: () => void;
  readonly openFor: (target: Target) => void;
  readonly sheet: HTMLDialogElement;
}

const textEditor = (unit: string): Editor => {
  const parts = build();
  parts.field.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      void save(parts);
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
    openFor: (target) => {
      openFor(parts, target);
    },
    sheet: parts.sheet,
  };
};

export { textEditor, type Editor };
