import { say, type UiKey } from '@/lib/text/ui';

import { onFault, type Fault } from './fault';

const byKind: Readonly<Record<string, UiKey>> = {
  'storage.blocked': 'notice.blocked',
  'storage.dropped': 'notice.unsaved',
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

const mountNotice = (element: HTMLElement): void => {
  const told = new Set<UiKey>();
  onFault((fault) => {
    const key = noticeFor(fault);
    if (key === null || told.has(key)) {
      return;
    }
    told.add(key);
    element.textContent = say(key);
    element.dataset.notice = key;
    element.hidden = false;
  });
};

export { mountNotice, noticeFor };
