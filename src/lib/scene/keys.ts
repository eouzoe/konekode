type Intent = 'backward' | 'forward' | 'none';

const backwardKeys = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);
const forwardKeys = new Set(['ArrowDown', 'ArrowRight', 'Enter', 'PageDown']);

const isControl = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLInputElement ||
  target instanceof HTMLButtonElement ||
  (target instanceof HTMLElement && target.closest('.cm-editor') !== null);

const writesText = (target: EventTarget | null): boolean =>
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLInputElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const wouldLeave = (event: KeyboardEvent): boolean =>
  event.key === 'Backspace' && !writesText(event.target);

const isDrillInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.dataset.role === 'input';

const hasModifier = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey;

const isPrintable = (key: string): boolean => key.length === 1;

const keyIntent = (key: string): Intent => {
  if (backwardKeys.has(key)) {
    return 'backward';
  }
  if (forwardKeys.has(key) || isPrintable(key)) {
    return 'forward';
  }
  return 'none';
};

const readIntent = (event: KeyboardEvent): Intent => {
  if (hasModifier(event)) {
    return 'none';
  }
  const intent = keyIntent(event.key);
  if (isDrillInput(event.target)) {
    if (intent === 'backward') {
      return intent;
    }
    return 'none';
  }
  if (isControl(event.target)) {
    return 'none';
  }
  return intent;
};

export { readIntent, wouldLeave, type Intent };
