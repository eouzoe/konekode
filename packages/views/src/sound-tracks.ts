import { refsRoute } from './scene/refs';

type Track = 'home' | 'study';
type Cue = 'click' | 'correct' | 'enter' | 'wrong';
type Gate = 'lit';

interface Layer {
  readonly delay: number;
  readonly end: number;
  readonly entries: ReadonlyArray<number>;
  readonly fade: number;
  readonly file: string;
  readonly gate?: Gate;
  readonly muffle?: number;
  readonly start: number;
}

const homeTurn = 71;
const lead = { music: 0 };
const indoors = { fade: 2.5, muffle: 3.5 };

const tracks: Readonly<Record<Track, ReadonlyArray<Layer>>> = {
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

const cuesOf: Readonly<Record<Track, ReadonlyArray<Cue>>> = {
  home: ['enter', 'click'],
  study: ['click', 'correct', 'wrong'],
};

const audioPath = (name: string): string => `${refsRoute}/1999/audio/web/${name}.mp3`;

const preloads = (track: Track): Array<string> => [
  ...tracks[track].map((layer) => audioPath(layer.file)),
  ...cuesOf[track].map((cue) => audioPath(cue)),
];

export { audioPath, cuesOf, preloads, tracks, type Cue, type Gate, type Layer, type Track };
