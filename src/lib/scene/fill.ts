import { diagnose } from '@/lib/run/diagnose';

const markLines = (lines: ReadonlyArray<HTMLElement>, beat: HTMLElement): void => {
  const marked = new Set((beat.dataset.lines ?? '').split(','));
  for (const line of lines) {
    line.dataset.marked = String(marked.has(line.dataset.line ?? ''));
  }
};

const fillInput = (stdin: HTMLElement | null, beat: HTMLElement): void => {
  const { input } = beat.dataset;
  if (stdin === null || input === undefined) {
    return;
  }
  stdin.textContent = input;
  const field = stdin.closest<HTMLElement>('[data-role="field"]');
  if (field !== null) {
    field.hidden = false;
  }
};

const fillExpect = (expect: HTMLElement | null, beat: HTMLElement): void => {
  const field = expect?.closest<HTMLElement>('[data-role="expect-field"]');
  if (expect === null || field === null || field === undefined) {
    return;
  }
  expect.textContent = beat.dataset.expect ?? '';
  field.hidden = beat.dataset.expect === undefined;
};

const mismatchNote = (root: HTMLElement, beat: HTMLElement | undefined): string =>
  diagnose(
    beat?.dataset.expect ?? '',
    root.querySelector('[data-role="output"]')?.textContent ?? '',
  );

const forward = 1;

const isShown = (beats: ReadonlyArray<HTMLElement>, index: number, at: number): boolean => {
  if (at > index) {
    return false;
  }
  return beats.slice(at + forward, index + forward).every((beat) => beat.dataset.append === 'true');
};

const showBeats = (beats: ReadonlyArray<HTMLElement>, index: number): void => {
  for (const [at, beat] of beats.entries()) {
    beat.hidden = !isShown(beats, index, at);
  }
};

export { fillExpect, fillInput, markLines, mismatchNote, showBeats };
