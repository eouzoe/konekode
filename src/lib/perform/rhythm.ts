interface Chunk {
  readonly pause: number;
  readonly text: string;
}

const wordPattern = /^[A-Za-z0-9_]+/u;
const wordPause = 95;
const symbolPause = 55;
const spacePause = 70;
const linePause = 300;

const firstChunk = (text: string): Chunk => {
  const word = wordPattern.exec(text)?.[0];
  if (word !== undefined) {
    return { pause: wordPause, text: word };
  }
  const char = text.charAt(0);
  if (char === '\n') {
    return { pause: linePause, text: char };
  }
  if (char === ' ') {
    return { pause: spacePause, text: char };
  }
  return { pause: symbolPause, text: char };
};

const chunks = (text: string): Chunk[] => {
  const found: Chunk[] = [];
  let rest = text;
  while (rest !== '') {
    const chunk = firstChunk(rest);
    found.push(chunk);
    rest = rest.slice(chunk.text.length);
  }
  return found;
};

export { chunks, firstChunk, type Chunk };
