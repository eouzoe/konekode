import { wait } from '@konekode/views/wait';

const latinRun = /(?<latin>[A-Za-z0-9<>"'$.;:{}()\\+#-]+[。！？，]?)/u;
const alternate = 2;

const element = (id: string): HTMLElement => {
  const found = document.querySelector<HTMLElement>(`#${id}`);
  if (found === null) {
    throw new Error(`missing #${id}`);
  }
  return found;
};

const inSequence = async <Item>(
  items: ReadonlyArray<Item>,
  step: (item: Item) => Promise<void>,
  signal: AbortSignal,
): Promise<void> => {
  const [head, ...rest] = items;
  if (head === undefined || signal.aborted) {
    return;
  }
  await step(head);
  await inSequence(rest, step, signal);
};

const pieceOf = (part: string, latin: boolean): Node => {
  if (!latin) {
    return document.createTextNode(part);
  }
  const span = document.createElement('span');
  span.className = 'latin';
  span.textContent = part;
  return span;
};

const sentenceOf = (text: string): HTMLElement => {
  const sentence = document.createElement('span');
  sentence.className = 'sentence';
  const parts = text.split(latinRun);
  sentence.append(...parts.map((part, at) => pieceOf(part, at % alternate === 1)));
  return sentence;
};

export { element, inSequence, sentenceOf, wait };
