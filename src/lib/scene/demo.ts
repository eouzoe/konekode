import { array, string } from '@/lib/zod';

const demoStart = (beats: readonly HTMLElement[], index: number): number =>
  beats.findLastIndex((beat, at) => at <= index && (beat.dataset.demo ?? '').startsWith('reset'));

const direct = (root: HTMLElement, beats: readonly HTMLElement[], index: number): void => {
  const beat = beats[index];
  const start = demoStart(beats, index);
  if (beat === undefined || start < 0 || beat.dataset.stage !== 'drill') {
    return;
  }
  const before = beats
    .slice(start, index)
    .map((earlier) => earlier.dataset.demo ?? '')
    .join(' ');
  const detail = { beat: beat.dataset.id ?? '', before, now: beat.dataset.demo ?? '' };
  root
    .querySelector('[data-typing-drill]')
    ?.dispatchEvent(new CustomEvent('drill:demo', { detail }));
};

const readKeys = (beat: HTMLElement | undefined): string[] | null => {
  const raw = beat?.dataset.keys;
  if (raw === undefined) {
    return null;
  }
  const value: unknown = JSON.parse(raw);
  return array(string()).parse(value);
};

interface Detail {
  readonly active: boolean;
  readonly beat: string;
  readonly before: readonly string[];
  readonly focus: boolean;
  readonly now: readonly string[];
}

const startsSequence = (beat: HTMLElement): boolean => {
  const keys = readKeys(beat);
  return keys?.[0] === 'reset';
};

const keysBefore = (beats: readonly HTMLElement[], index: number): string[] => {
  const start = beats.findLastIndex((beat, at) => at <= index && startsSequence(beat));
  return beats.slice(Math.max(start, 0), index).flatMap((beat) => readKeys(beat) ?? []);
};

const describeStage = (beats: readonly HTMLElement[], index: number, focus: boolean): Detail => {
  const now = readKeys(beats[index]);
  const beat = beats[index]?.dataset.id ?? '';
  if (now === null) {
    return { active: false, beat, before: [], focus, now: [] };
  }
  return { active: true, beat, before: keysBefore(beats, index), focus: false, now };
};

const stageRun = (root: HTMLElement, beats: readonly HTMLElement[], focus: boolean): void => {
  const index = beats.findLastIndex((beat) => beat.hidden === false);
  if (beats[index]?.dataset.stage !== 'run') {
    return;
  }
  const detail = describeStage(beats, index, focus);
  root
    .querySelector('[data-code-runner]')
    ?.dispatchEvent(new CustomEvent('runner:stage', { detail }));
};

export { direct, stageRun };
