import { refsRoute } from './refs';

type Track = 'home' | 'study';
type Cue = 'click' | 'correct' | 'enter' | 'wrong';
type Switch = 'off' | 'on';

interface Layer {
  readonly delay: number;
  readonly end: number;
  readonly entries: readonly number[];
  readonly fade: number;
  readonly file: string;
  readonly start: number;
}

interface Voice {
  readonly gain: GainNode;
  readonly source: AudioBufferSourceNode;
}

interface Playing {
  readonly track: Track;
  readonly voices: readonly Voice[];
}

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly probe: AnalyserNode;
}

interface Probe {
  readonly cues: readonly Cue[];
  readonly level: number;
  readonly music: Track | null;
  readonly running: boolean;
  readonly switch: Switch;
}

const homeTurn = 71;
const tracks: Readonly<Record<Track, readonly Layer[]>> = {
  home: [
    { delay: 0, end: 120, entries: [0], fade: 2, file: 'home-rain', start: 0 },
    { delay: 1, end: 142, entries: [0, homeTurn], fade: 1, file: 'home', start: 0 },
  ],
  study: [{ delay: 0, end: 214, entries: [0], fade: 2.5, file: 'study', start: 1 }],
};
const cues: readonly Cue[] = ['click', 'correct', 'enter', 'wrong'];
const level = { cue: 0.8, music: 0.6, silent: 0.0001 };
const leaving = 0.9;
const kept = { cues: 40, samples: 2048 };
const saved = 'konekode.sound';
const gestures = ['pointerdown', 'keydown'] as const;

const sound: {
  graph: Graph | null;
  playing: Playing | null;
  played: Cue[];
  switch: Switch;
  wanted: Track | null;
} = { graph: null, played: [], playing: null, switch: 'on', wanted: null };

const buffers = new Map<string, Promise<AudioBuffer>>();

const urlOf = (name: string): string =>
  new URL(`${refsRoute}/1999/audio/web/${name}.mp3`, location.href).href;

const load = (graph: Graph, name: string): Promise<AudioBuffer> => {
  const cached = buffers.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const fetchAndDecode = async (): Promise<AudioBuffer> => {
    const response = await fetch(urlOf(name));
    return graph.context.decodeAudioData(await response.arrayBuffer());
  };
  const loading = fetchAndDecode();
  buffers.set(name, loading);
  return loading;
};

const stateOf = (): string => {
  if (sound.switch === 'off') {
    return 'off';
  }
  if (sound.graph === null) {
    return 'waiting';
  }
  return 'on';
};

const mark = (): void => {
  Object.assign(document.documentElement.dataset, {
    music: sound.playing?.track ?? '',
    sound: stateOf(),
  });
};

const silence = (graph: Graph, voice: Voice, seconds: number): void => {
  const now = graph.context.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.exponentialRampToValueAtTime(level.silent, now + seconds);
  voice.source.stop(now + seconds);
};

const stopMusic = (seconds: number): void => {
  const { graph, playing } = sound;
  if (graph !== null && playing !== null) {
    for (const voice of playing.voices) {
      silence(graph, voice, seconds);
    }
  }
  sound.playing = null;
  mark();
};

const entryOf = (layer: Layer): number =>
  layer.entries[Math.floor(Math.random() * layer.entries.length)] ?? layer.start;

const voiceOf = (graph: Graph, layer: Layer, buffer: AudioBuffer): Voice => {
  const begins = graph.context.currentTime + layer.delay;
  const gain = graph.context.createGain();
  gain.gain.setValueAtTime(level.silent, begins);
  gain.gain.exponentialRampToValueAtTime(level.music, begins + layer.fade);
  gain.connect(graph.master);
  const source = graph.context.createBufferSource();
  Object.assign(source, { buffer, loop: true, loopEnd: layer.end, loopStart: layer.start });
  source.connect(gain);
  source.start(begins, entryOf(layer));
  return { gain, source };
};

const voicesOf = (
  graph: Graph,
  layers: readonly Layer[],
  loaded: readonly AudioBuffer[],
): Voice[] =>
  layers.flatMap((layer, index) => {
    const buffer = loaded[index];
    if (buffer === undefined) {
      return [];
    }
    return [voiceOf(graph, layer, buffer)];
  });

const due = (track: Track): boolean =>
  sound.wanted === track && sound.switch === 'on' && sound.playing?.track !== track;

const startMusic = async (): Promise<void> => {
  const { graph, wanted } = sound;
  if (graph === null || wanted === null || !due(wanted)) {
    return;
  }
  const layers = tracks[wanted];
  const loaded = await Promise.all(layers.map((layer) => load(graph, layer.file)));
  if (!due(wanted)) {
    return;
  }
  stopMusic(leaving);
  sound.playing = { track: wanted, voices: voicesOf(graph, layers, loaded) };
  mark();
};

const build = (): Graph => {
  const context = new AudioContext();
  const master = context.createGain();
  const probe = context.createAnalyser();
  probe.fftSize = kept.samples;
  master.connect(probe);
  probe.connect(context.destination);
  return { context, master, probe };
};

const firstGesture = new AbortController();

const unlock = (): void => {
  firstGesture.abort();
  sound.graph ??= build();
  void sound.graph.context.resume();
  for (const name of cues) {
    void load(sound.graph, name);
  }
  void startMusic();
  mark();
};

const music = (track: Track): void => {
  sound.wanted = track;
  void startMusic();
};

const leave = (): number => {
  sound.wanted = null;
  stopMusic(leaving);
  return leaving;
};

const record = (name: Cue): void => {
  sound.played.push(name);
  if (sound.played.length > kept.cues) {
    sound.played.shift();
  }
};

const sounding = async (graph: Graph, name: Cue): Promise<void> => {
  const buffer = await load(graph, name);
  const gain = graph.context.createGain();
  gain.gain.value = level.cue;
  gain.connect(graph.master);
  const source = graph.context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start();
};

const cue = (name: Cue): void => {
  const { graph } = sound;
  if (graph === null || sound.switch === 'off') {
    return;
  }
  record(name);
  void sounding(graph, name);
};

const levelOf = (probe: AnalyserNode): number => {
  const samples = new Float32Array(probe.fftSize);
  probe.getFloatTimeDomainData(samples);
  const power = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length;
  return Math.sqrt(power);
};

const outputLevel = (): number => {
  if (sound.graph === null) {
    return 0;
  }
  return levelOf(sound.graph.probe);
};

const probe = (): Probe => ({
  cues: [...sound.played],
  level: outputLevel(),
  music: sound.playing?.track ?? null,
  running: sound.graph?.context.state === 'running',
  switch: sound.switch,
});

if (localStorage.getItem(saved) === 'off') {
  sound.switch = 'off';
}
for (const type of gestures) {
  document.addEventListener(type, unlock, { capture: true, signal: firstGesture.signal });
}
mark();

export { cue, leave, music, probe, type Cue, type Probe, type Track };
