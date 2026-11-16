import { findKey } from './keyboard';
import { messages } from './messages';

const describeNext = (char: string): string => {
  if (char === '\n') {
    return messages.pressEnter;
  }
  if (char === ' ') {
    return messages.pressSpace;
  }
  const found = findKey(char);
  if (found?.shift === true) {
    return `${messages.typeChar}${char}（${messages.withShift}${found.key}）`;
  }
  return `${messages.typeChar}${char}`;
};

const describeCommand = (key: string): string => {
  const found = findKey(key);
  if (found?.shift === true) {
    return `${messages.press}${key}（${messages.withShift}${found.key}）`;
  }
  return `${messages.press}${key}`;
};

export { describeCommand, describeNext };
