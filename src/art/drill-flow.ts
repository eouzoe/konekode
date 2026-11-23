import { gsap } from 'gsap';

import { inSequence, wait } from './dom';
import { paced } from './motion';
import {
  beats,
  createBuffer,
  createDrill,
  describeNext,
  drillDone,
  drillEscape,
  drillPress,
  drillTyped,
  expectedChar,
  messages,
  needsTelling,
  template,
  type Buffer,
  type Drill,
} from './unit';

import type { Keyboard } from './keyboard';
import type { Paper } from './paper';

interface DrillFlow {
  readonly done: () => boolean;
  readonly hint: () => string;
  readonly nextKey: () => string | undefined;
  readonly play: (tokens: ReadonlyArray<string>, signal: AbortSignal) => Promise<void>;
  readonly press: (key: string) => boolean;
  readonly replayTo: (index: number) => void;
}

interface DrillParts {
  readonly keyboard: Keyboard;
  readonly modeLine: HTMLElement;
  readonly paper: Paper;
}

interface Session {
  readonly parts: DrillParts;
  drill: Drill;
}

interface Token {
  readonly arg: string;
  readonly kind: string;
}

const pace = { fill: 0.03, pause: 0.55 };
const modeFlash = { duration: 0.5, ease: 'back.out(3)', scale: 1 };
const modeFlashFrom = { scale: 1.25 };
const fromEnd = -1;
const keyOfChar = new Map([['\n', 'Enter']]);
const charOfKey = new Map([['Enter', '\n']]);
const feedbackWords: Partial<Record<Drill['feedback'], string>> = {
  'need-insert': messages.needInsert,
  'no-delete': messages.noDelete,
};

const tokensOf = (demo: string | undefined): Array<string> =>
  (demo ?? '').split(' ').filter(Boolean);

const parse = (text: string): Token => {
  const [kind = '', arg = ''] = text.split(':');
  return { arg, kind };
};

const startOfDemo = (index: number): number =>
  Math.max(
    beats.findLastIndex((beat, at) => at <= index && (beat.demo ?? '').startsWith('reset')),
    0,
  );

const correctionOf = (drill: Drill): string => {
  const next = expectedChar(drill);
  if (drill.feedback === 'wrong-key') {
    return `${messages.wrong}${describeNext(next)}`;
  }
  const feedback = feedbackWords[drill.feedback];
  if (feedback !== undefined) {
    return feedback;
  }
  if (drill.mode === 'insert' && needsTelling(next)) {
    return describeNext(next);
  }
  return '';
};

const hintOf = (drill: Drill): string => {
  if (drillDone(drill)) {
    return messages.done;
  }
  if (drillTyped(drill)) {
    return messages.pressEsc;
  }
  return correctionOf(drill);
};

const nextKeyOf = (drill: Drill): string | undefined => {
  if (drillDone(drill)) {
    return undefined;
  }
  if (drillTyped(drill)) {
    return 'Escape';
  }
  if (drill.mode === 'normal') {
    return 'i';
  }
  const next = expectedChar(drill);
  return keyOfChar.get(next) ?? next;
};

const applyKey = (drill: Drill, key: string): Drill => {
  if (key === 'Escape') {
    return drillEscape(drill);
  }
  if (key === 'Backspace') {
    return { ...drill, feedback: 'no-delete' };
  }
  return drillPress(drill, charOfKey.get(key) ?? key);
};

const filled = (drill: Drill): Array<Drill> => {
  if (drillTyped(drill)) {
    return [];
  }
  const next = drillPress(drill, expectedChar(drill));
  return [next, ...filled(next)];
};

const modeOf = (arg: string): Buffer['mode'] => {
  if (arg === 'insert') {
    return 'insert';
  }
  return 'normal';
};

const set = (session: Session, drill: Drill): void => {
  session.drill = drill;
  session.parts.paper.state.buffer = {
    ...createBuffer(template.slice(0, drill.position), drill.position),
    mode: drill.mode,
  };
};

const press = (session: Session, key: string): boolean => {
  set(session, applyKey(session.drill, key));
  return session.drill.feedback === 'none';
};

const reset = (session: Session): void => {
  set(session, createDrill(template));
  session.parts.paper.state.modeOverride = null;
};

const pressShown = (session: Session, key: string, instant: boolean): void => {
  session.parts.paper.state.modeOverride = null;
  if (!press(session, key) && !instant) {
    session.parts.paper.shake();
  }
};

const act = (session: Session, { arg, kind }: Token, instant: boolean): void => {
  if (kind === 'reset' || kind === 'live') {
    reset(session);
  } else if (kind === 'show') {
    session.parts.paper.state.modeOverride = modeOf(arg);
  } else if (kind === 'esc') {
    press(session, 'Escape');
  } else if (kind === 'fill') {
    set(session, filled(session.drill).at(fromEnd) ?? session.drill);
  } else if (kind === 'key') {
    pressShown(session, arg, instant);
  }
};

const show = async ({ keyboard, modeLine }: DrillParts, { arg, kind }: Token): Promise<void> => {
  if (kind === 'flash') {
    gsap.fromTo(modeLine, modeFlashFrom, { ...modeFlash, duration: paced(modeFlash.duration) });
  } else if (kind === 'wait') {
    await wait(pace.pause);
  } else if (kind === 'down') {
    keyboard.down(arg);
  } else if (kind === 'up') {
    keyboard.up(arg);
  }
};

const fillSlowly = async (session: Session, signal: AbortSignal): Promise<void> => {
  const step = async (next: Drill): Promise<void> => {
    set(session, next);
    session.parts.paper.draw();
    await wait(pace.fill);
  };
  await inSequence(filled(session.drill), step, signal);
};

const playToken = async (session: Session, token: Token, signal: AbortSignal): Promise<void> => {
  if (token.kind === 'fill') {
    await fillSlowly(session, signal);
  } else {
    await show(session.parts, token);
    act(session, token, false);
  }
  session.parts.paper.draw();
};

const replayTo = (session: Session, index: number): void => {
  reset(session);
  const tokens = beats.slice(startOfDemo(index), index).flatMap((beat) => tokensOf(beat.demo));
  for (const token of tokens) {
    act(session, parse(token), true);
  }
};

const createDrillFlow = (parts: DrillParts): DrillFlow => {
  const session: Session = { drill: createDrill(template), parts };
  return {
    done: () => drillDone(session.drill),
    hint: () => hintOf(session.drill),
    nextKey: () => nextKeyOf(session.drill),
    play: async (tokens, signal) => {
      const step = (token: Token): Promise<void> => playToken(session, token, signal);
      await inSequence(
        tokens.map((token) => parse(token)),
        step,
        signal,
      );
    },
    press: (key) => press(session, key),
    replayTo: (index) => {
      replayTo(session, index);
    },
  };
};

export { createDrillFlow, tokensOf, type DrillFlow };
