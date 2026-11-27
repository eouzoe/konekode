import { say, type UiKey } from '@konekode/course/ui';

import { onFault, type Fault } from './fault';

const byKind: Readonly<Record<string, UiKey>> = {
  'storage.blocked': 'notice.blocked',
  'storage.dropped': 'notice.unsaved',
  'storage.stalled': 'notice.unsaved',
  'storage.unavailable': 'notice.unsaved',
  'storage.write': 'notice.unsaved',
};

const brokenAt = new Set(['scenes']);

const noticeFor = (fault: Fault): UiKey | null => {
  if (fault.kind === 'rejected' && brokenAt.has(fault.where)) {
    return 'notice.broken';
  }
  return byKind[fault.kind] ?? null;
};

const withdrawnBy: Readonly<Record<string, string>> = {
  'storage.recovered': 'storage.stalled',
};

const withdraw = (element: HTMLElement, fault: Fault): boolean => {
  const cause = withdrawnBy[fault.kind];
  if (cause === undefined || element.dataset.cause !== cause) {
    return false;
  }
  element.hidden = true;
  element.dataset.cause = '';
  element.dataset.notice = '';
  return true;
};

const tell = (element: HTMLElement, key: UiKey, fault: Fault): void => {
  element.textContent = say(key);
  Object.assign(element.dataset, { cause: fault.kind, notice: key });
  element.hidden = false;
};

const mountNotice = (element: HTMLElement): void => {
  const told = new Set<string>();
  onFault((fault) => {
    const shown = element.dataset.notice ?? '';
    if (withdraw(element, fault)) {
      told.delete(shown);
      return;
    }
    const key = noticeFor(fault);
    if (key !== null && !told.has(key)) {
      told.add(key);
      tell(element, key, fault);
    }
  });
};

export { mountNotice, noticeFor };
