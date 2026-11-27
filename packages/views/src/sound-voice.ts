import type { Layer } from './sound-tracks';

interface Mixer {
  readonly context: AudioContext;
  readonly master: GainNode;
}

interface Voice {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

interface Into {
  readonly begins: number;
  readonly gain: GainNode;
}

const level = { music: 0.6, silent: 0.0001 };
const muffled = { from: 350, to: 20_000 };

const entryOf = (layer: Layer): number =>
  layer.entries[Math.floor(Math.random() * layer.entries.length)] ?? layer.start;

const inputOf = (mixer: Mixer, layer: Layer, { begins, gain }: Into): AudioNode => {
  if (layer.muffle === undefined) {
    return gain;
  }
  const filter = mixer.context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(muffled.from, begins);
  filter.frequency.exponentialRampToValueAtTime(muffled.to, begins + layer.muffle);
  filter.connect(gain);
  return filter;
};

const voiceOf = (mixer: Mixer, layer: Layer, buffer: AudioBuffer): Voice => {
  const begins = mixer.context.currentTime + layer.delay;
  const gain = mixer.context.createGain();
  gain.gain.setValueAtTime(0, begins);
  gain.gain.linearRampToValueAtTime(level.music, begins + layer.fade);
  gain.connect(mixer.master);
  const source = mixer.context.createBufferSource();
  Object.assign(source, { buffer, loop: true, loopEnd: layer.end, loopStart: layer.start });
  source.connect(inputOf(mixer, layer, { begins, gain }));
  source.start(begins, entryOf(layer));
  return { gain, source };
};

const silence = (mixer: Mixer, voice: Voice, seconds: number): void => {
  const now = mixer.context.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.exponentialRampToValueAtTime(level.silent, now + seconds);
  voice.source.stop(now + seconds);
};

export { silence, voiceOf, type Mixer, type Voice };
