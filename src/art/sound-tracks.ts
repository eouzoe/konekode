import { refsRoute } from './refs';

type Track = 'home' | 'study';
type Gate = 'lit';

interface Layer {
  readonly delay: number;
  readonly end: number;
  readonly entries: readonly number[];
  readonly fade: number;
  readonly file: string;
  readonly gate?: Gate;
  readonly muffle?: number;
  readonly start: number;
}

const homeTurn = 71;
const lead = { music: 0 };
const indoors = { fade: 2.5, muffle: 3.5 };

const tracks: Readonly<Record<Track, readonly Layer[]>> = {
  home: [
    { delay: 0, end: 120, entries: [0], fade: 2, file: 'home-rain', start: 0 },
    {
      delay: lead.music,
      end: 142,
      entries: [0, homeTurn],
      fade: indoors.fade,
      file: 'home',
      gate: 'lit',
      muffle: indoors.muffle,
      start: 0,
    },
  ],
  study: [{ delay: 0, end: 214, entries: [0], fade: 2.5, file: 'study', start: 1 }],
};

const audioPath = (name: string): string => `${refsRoute}/1999/audio/web/${name}.mp3`;

const preloads = (track: Track, cues: readonly string[]): string[] => [
  ...tracks[track].map((layer) => audioPath(layer.file)),
  ...cues.map((cue) => audioPath(cue)),
];

export { audioPath, preloads, tracks, type Gate, type Layer, type Track };
