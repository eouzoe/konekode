import { firstChunk, type Chunk } from '@/lib/perform/rhythm';

import { createDrill, escape, press, remind, type Drill } from './drill';
import { messages } from './messages';
import { type Parts } from './view';

interface Session {
  beat: string;
  demo: boolean;
  guide: boolean;
  live: Drill;
  pretend: string;
  show: Drill;
  token: number;
}

interface Script {
  readonly beat: string;
  readonly before: string;
  readonly now: string;
}

type Step = (session: Session, parts: Parts, value: string) => void;

const stepDelay = 420;
const flashFrames = [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 1 }];
const flashTiming = { duration: 380, iterations: 2 };
const labels: Record<string, string> = {
  insert: messages.modeInsert,
  normal: messages.modeNormal,
};

const setDown = (parts: Parts, key: string, down: boolean): void => {
  for (const element of parts.keyboard.querySelectorAll<HTMLElement>('.key')) {
    if (key === '' || element.dataset.key === key) {
      element.dataset.down = String(down);
    }
  }
};

const steps: Record<string, Step> = {
  demo: (session) => {
    session.demo = true;
  },
  down: (_session, parts, value) => {
    setDown(parts, value, true);
  },
  esc: (session) => {
    session.show = escape(session.show);
  },
  flash: (_session, parts) => {
    parts.mode.animate(flashFrames, flashTiming);
  },
  hint: (session) => {
    session.guide = true;
    session.show = remind(session.show, 'none');
  },
  hush: (session) => {
    session.guide = false;
  },
  key: (session, _parts, value) => {
    session.show = press(session.show, value);
  },
  live: (session) => {
    session.demo = false;
  },
  reset: (session, parts) => {
    session.guide = false;
    session.show = createDrill(session.show.target);
    setDown(parts, '', false);
  },
  show: (session, _parts, value) => {
    session.pretend = value;
  },
  up: (_session, parts, value) => {
    setDown(parts, value, false);
  },
};

const nextChunk = (drill: Drill): Chunk => firstChunk(drill.target.slice(drill.position));

const instant = new Set(['hint', 'hush']);

export {
  flashFrames,
  instant,
  labels,
  nextChunk,
  setDown,
  stepDelay,
  steps,
  type Script,
  type Session,
};
