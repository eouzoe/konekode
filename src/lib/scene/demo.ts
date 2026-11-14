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
  const detail = { before, now: beat.dataset.demo ?? '' };
  root
    .querySelector('[data-typing-drill]')
    ?.dispatchEvent(new CustomEvent('drill:demo', { detail }));
};

export { direct };
