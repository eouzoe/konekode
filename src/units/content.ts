import { unitContent } from './index';

const idLength = 16;
const hexBase = 16;
const byteWidth = 2;
const unhashed = 'unhashed';

const contentText = (content: unknown = unitContent()): string => JSON.stringify(content);

const secureSubtle = (): SubtleCrypto | null => {
  if (!('subtle' in globalThis.crypto)) {
    return null;
  }
  return globalThis.crypto.subtle;
};

const contentIdOf = async (
  text: string,
  subtle: SubtleCrypto | null = secureSubtle(),
): Promise<string> => {
  if (subtle === null) {
    return unhashed;
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(hexBase).padStart(byteWidth, '0'))
    .join('')
    .slice(0, idLength);
};

let known: Promise<string> | null = null;

const contentId = (): Promise<string> => {
  known ??= contentIdOf(contentText());
  return known;
};

export { contentId, contentIdOf, contentText, unhashed };
