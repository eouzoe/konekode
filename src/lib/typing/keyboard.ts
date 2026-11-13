interface KeyCap {
  readonly base: string;
  readonly shift: string;
}

interface KeyPress {
  readonly key: string;
  readonly shift: boolean;
}

const backspaceKey = 'Backspace';
const enterKey = 'Enter';
const shiftKey = 'Shift';
const spaceKey = 'Space';

const toCaps = (text: string): KeyCap[] =>
  text.split(' ').map((pair) => ({ base: pair.charAt(0), shift: pair.charAt(1) }));

const rows: readonly (readonly KeyCap[])[] = [
  toCaps('`~ 1! 2@ 3# 4$ 5% 6^ 7& 8* 9( 0) -_ =+'),
  toCaps(String.raw`qQ wW eE rR tT yY uU iI oO pP [{ ]} \|`),
  toCaps('aA sS dD fF gG hH jJ kK lL ;: \'"'),
  toCaps('zZ xX cC vV bB nN mM ,< .> /?'),
];

const findKey = (char: string): KeyPress | null => {
  if (char === '\n') {
    return { key: enterKey, shift: false };
  }
  if (char === ' ') {
    return { key: spaceKey, shift: false };
  }
  for (const cap of rows.flat()) {
    if (cap.base === char) {
      return { key: cap.base, shift: false };
    }
    if (cap.shift === char) {
      return { key: cap.base, shift: true };
    }
  }
  return null;
};

export { backspaceKey, enterKey, findKey, rows, shiftKey, spaceKey, type KeyCap, type KeyPress };
