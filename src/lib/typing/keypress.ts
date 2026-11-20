import { escape, press, remind, type Drill } from './drill';
import { escapeKey } from './keyboard';

const deleteKeys = new Set(['Backspace', 'Delete']);

const typedBy = (event: KeyboardEvent): string | null => {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  if (event.key === 'Enter') {
    return '\n';
  }
  if (event.key.length === 1) {
    return event.key;
  }
  return null;
};

const typeInto = (drill: Drill, text: string): Drill => {
  let next = drill;
  for (const char of text) {
    next = press(next, char);
  }
  return next;
};

const judge = (drill: Drill, event: KeyboardEvent): Drill | null => {
  const typed = typedBy(event);
  if (event.key === escapeKey) {
    return escape(drill);
  }
  if (deleteKeys.has(event.key)) {
    return remind(drill, 'no-delete');
  }
  if (typed === null) {
    return null;
  }
  return press(drill, typed);
};

const onKeyDown = (drill: Drill, event: KeyboardEvent): Drill => {
  const next = judge(drill, event);
  if (next === null) {
    return drill;
  }
  event.preventDefault();
  event.stopPropagation();
  return next;
};

export { onKeyDown, typeInto };
