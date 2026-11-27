import {
  audioPath,
  cuesOf,
  tracks,
  type Cue,
  type Gate,
  type Layer,
  type Track,
} from './sound-tracks';
import { silence, voiceOf, type Voice } from './sound-voice';

type Switch = 'off' | 'on';

interface Waiting {
  readonly buffer: AudioBuffer;
  readonly layer: Layer;
}

interface Playing {
  readonly track: Track;
  readonly voices: Array<Voice>;
  readonly waiting: Array<Waiting>;
}

interface Graph {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly probe: AnalyserNode;
}

interface Probe {
  readonly cues: ReadonlyArray<Cue>;
  readonly level: number;
  readonly music: Track | null;
  readonly running: boolean;
  readonly switch: Switch;
}

const level = { cue: 0.8 };
const leaving = 0.9;
const kept = { cues: 40, samples: 2048 };
const saved = 'konekode.sound';
const gestures = ['pointerdown', 'keydown'] as const;

const sound: {
  graph: Graph | null;
  playing: Playing | null;
  played: Array<Cue>;
  switch: Switch;
  wanted: Track | null;
} = { graph: null, played: [], playing: null, switch: 'on', wanted: null };

const buffers = new Map<string, Promise<AudioBuffer | null>>();

const urlOf = (name: string): string => new URL(audioPath(name), location.href).href;

const load = (graph: Graph, name: string): Promise<AudioBuffer | null> => {
  const cached = buffers.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const fetchAndDecode = async (): Promise<AudioBuffer | null> => {
    try {
      const response = await fetch(urlOf(name), { priority: 'low' });
      return await graph.context.decodeAudioData(await response.arrayBuffer());
    } catch {
      performance.mark(`sound:missing:${name}`);
      return null;
    }
  };
  const loading = fetchAndDecode();
  buffers.set(name, loading);
  return loading;
};

const loadCues = (graph: Graph): void => {
  if (sound.wanted === null) {
    return;
  }
  for (const name of cuesOf[sound.wanted]) {
    void load(graph, name);
  }
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

const gates = new Set<Gate>();

const isOpen = (layer: Layer): boolean => layer.gate === undefined || gates.has(layer.gate);

const join = (graph: Graph, playing: Playing, pair: Waiting): void => {
  if (isOpen(pair.layer)) {
    playing.voices.push(voiceOf(graph, pair.layer, pair.buffer));
    return;
  }
  playing.waiting.push(pair);
};

const arrive = async (graph: Graph, playing: Playing, layer: Layer): Promise<void> => {
  const buffer = await load(graph, layer.file);
  if (buffer === null) {
    return;
  }
  performance.mark(`sound:decoded:${layer.file}`);
  if (sound.playing === playing) {
    join(graph, playing, { buffer, layer });
  }
};

const open = (gate: Gate): void => {
  gates.add(gate);
  const { graph, playing } = sound;
  if (graph === null || playing === null) {
    return;
  }
  const ready = playing.waiting.filter((pair) => isOpen(pair.layer));
  const still = playing.waiting.filter((pair) => !isOpen(pair.layer));
  playing.waiting.splice(0, playing.waiting.length, ...still);
  playing.voices.push(...ready.map((pair) => voiceOf(graph, pair.layer, pair.buffer)));
};

const due = (track: Track): boolean =>
  sound.wanted === track && sound.switch === 'on' && sound.playing?.track !== track;

const startMusic = (): void => {
  const { graph, wanted } = sound;
  if (graph === null || wanted === null || !due(wanted)) {
    return;
  }
  stopMusic(leaving);
  const playing: Playing = { track: wanted, voices: [], waiting: [] };
  sound.playing = playing;
  mark();
  for (const layer of tracks[wanted]) {
    void arrive(graph, playing, layer);
  }
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

const prepare = (): Graph => {
  if (sound.graph !== null) {
    return sound.graph;
  }
  const graph = build();
  sound.graph = graph;
  performance.mark('sound:built');
  graph.context.addEventListener('statechange', () => {
    performance.mark(`sound:${graph.context.state}`);
    if (graph.context.state === 'running') {
      firstGesture.abort();
    }
    mark();
  });
  loadCues(graph);
  return graph;
};

const wake = async (graph: Graph): Promise<void> => {
  try {
    await graph.context.resume();
  } catch {
    performance.mark('sound:unavailable');
  }
};

const unlock = (): void => {
  void wake(prepare());
  mark();
};

const music = (track: Track): void => {
  sound.wanted = track;
  if (sound.graph !== null) {
    loadCues(sound.graph);
  }
  startMusic();
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

const sounding = async (graph: Graph, name: Cue): Promise<number> => {
  const buffer = await load(graph, name);
  if (buffer === null) {
    return 0;
  }
  const gain = graph.context.createGain();
  gain.gain.value = level.cue;
  gain.connect(graph.master);
  const source = graph.context.createBufferSource();
  source.buffer = buffer;
  source.connect(gain);
  source.start();
  return buffer.duration;
};

const cue = (name: Cue): Promise<number> => {
  const { graph } = sound;
  if (graph === null || sound.switch === 'off') {
    return Promise.resolve(0);
  }
  record(name);
  return sounding(graph, name);
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
if (sound.switch === 'on') {
  void wake(prepare());
}
mark();

export { cue, leave, music, open, probe, type Cue, type Probe };
export { type Track } from './sound-tracks';
