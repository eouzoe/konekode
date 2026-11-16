interface Run {
  readonly column: number;
  readonly fill: string;
  readonly line: number;
  readonly width: number;
}

interface Layer {
  readonly rows: readonly string[];
  readonly top: number;
}

const size = 24;
const empty = '.';

const palette: ReadonlyMap<string, string> = new Map([
  ['B', '#414868'],
  ['K', '#0f0f14'],
  ['M', '#737aa2'],
  ['N', '#f7768e'],
  ['O', '#565f89'],
  ['P', '#0f0f14'],
  ['W', '#c0caf5'],
  ['Y', '#e0af68'],
]);

const body: Layer = {
  rows: [
    '........................',
    '...OO..............OO...',
    '..OKKO............OKKO..',
    '..OKNKO..........OKNKO..',
    '..OKNNKOOOOOOOOOOKNNKO..',
    '..OKKKKKKKKKKKKKKKKKKO..',
    '.OKKKKKKKKKKKKKKKKKKKKO.',
    '.OKKKKKKKKKKKKKKKKKKKKO.',
    '.OKKKYYYKKKKKKKKYYYKKKO.',
    '.OKKYWPYYKKKKKKYWPYYKKO.',
    '.OKKYYPYYKKKKKKYYPYYKKO.',
    '.OKKYYPYYKKKKKKYYPYYKKO.',
    '.OKKKYYYKKKNNKKKYYYKKKO.',
    '.OKKKKKKKKMKKMKKKKKKKKO.',
    '..OKKKKKKKKMMKKKKKKKKO..',
    '...OOKKKKKKKKKKKKKKOO...',
    '.....OKKKKKKKKKKKKO.....',
    '....OKKKKKKKKKKKKKKO....',
    '....OKKKKKKKKKKKKKKO.OO.',
    '....OKKKKKKKKKKKKKKOOKKO',
    '....OKKBBKKKKKKBBKKOKKO.',
    '....OKKBBKKKKKKBBKKKKO..',
    '.....OOOOOOOOOOOOOOOO...',
    '........................',
  ],
  top: 0,
};

const blink: Layer = {
  rows: [
    '.OKKKKKKKKKKKKKKKKKKKKO.',
    '.OKKKKKKKKKKKKKKKKKKKKO.',
    '.OKKMMMMMKKKKKKMMMMMKKO.',
    '.OKKKKKKKKKKKKKKKKKKKKO.',
  ],
  top: 8,
};

const talk: Layer = {
  rows: ['.OKKKKKKKKMMMMKKKKKKKKO.', '..OKKKKKKKMNNMKKKKKKKO..'],
  top: 13,
};

const rowRuns = (row: string, line: number): Run[] => {
  const runs: Run[] = [];
  let start = 0;
  for (let end = 1; end <= row.length; end += 1) {
    const code = row.charAt(start);
    if (row.charAt(end) !== code) {
      const fill = palette.get(code);
      if (fill !== undefined) {
        runs.push({ column: start, fill, line, width: end - start });
      }
      start = end;
    }
  }
  return runs;
};

const runsOf = (layer: Layer): Run[] =>
  layer.rows.flatMap((row, at) => rowRuns(row, layer.top + at));

export { blink, body, empty, palette, runsOf, size, talk, type Layer, type Run };
