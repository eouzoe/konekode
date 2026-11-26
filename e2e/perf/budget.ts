interface Budget {
  readonly firstPaint: number;
  readonly path: string;
  readonly usable: number;
}

const kibi = 1024;
const homePaintKibi = 12;
const homeUsableKibi = 16;
const startPaintKibi = 16;
const startUsableKibi = 300;

const budgets: ReadonlyArray<Budget> = [
  { firstPaint: homePaintKibi * kibi, path: '/', usable: homeUsableKibi * kibi },
  { firstPaint: startPaintKibi * kibi, path: '/learn/start/', usable: startUsableKibi * kibi },
];

export { budgets, type Budget };
