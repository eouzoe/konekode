import { effectOf } from '@/lib/edit/effect';
import { between, finalText, goalOf } from '@/lib/edit/goal';
import { press, type Pressed, type Session } from '@/lib/edit/session';
import { knownKeys, run } from '@/lib/edit/step';

import { createScreen, type Screen } from './screen';
import { effectText } from './view';

import type { Buffer, Rules } from '@/lib/edit/buffer';

interface Desk {
  readonly blur: () => void;
  readonly focus: () => void;
  readonly hush: () => void;
  readonly session: () => Session;
  readonly setArmed: (armed: boolean) => void;
  readonly setSession: (session: Session) => void;
  readonly showSprite: (buffer: Buffer | null, goal?: string) => void;
  readonly text: (ofSprite: boolean) => string;
}

interface Options {
  readonly onChange: (buffer: Buffer) => void;
  readonly onPress: (pressed: Pressed) => void;
  readonly parent: HTMLElement;
  readonly rules: () => Rules;
  readonly start: Buffer;
}

interface State {
  armed: boolean;
  session: Session;
  sprite: Buffer | null;
  turn: number;
}

const ignored = new Set([
  'Alt',
  'AltGraph',
  'CapsLock',
  'ContextMenu',
  'Control',
  'Meta',
  'NumLock',
  'OS',
  'PageDown',
  'PageUp',
  'ScrollLock',
  'Shift',
  'Tab',
]);
const functionKey = /^F\d+$/u;

const isShortcut = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey;

const isPassed = (event: KeyboardEvent): boolean =>
  ignored.has(event.key) || functionKey.test(event.key);

const keyFrom = (event: KeyboardEvent): string | null => {
  if (isShortcut(event) || isPassed(event)) {
    return null;
  }
  return event.key;
};

const allowFocus = (parent: HTMLElement, armed: boolean): void => {
  if (armed) {
    parent.tabIndex = 0;
    return;
  }
  parent.removeAttribute('tabindex');
};

const actorOf = (sprite: Buffer | null): string => {
  if (sprite === null) {
    return 'student';
  }
  return 'sprite';
};

interface Inner {
  readonly options: Options;
  readonly screen: Screen;
  readonly setSession: (session: Session) => void;
  readonly state: State;
}

const isElsewhere = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('dialog, input, textarea, select') !== null;

const frameGap = 55;

const framesOf = (before: Buffer, rules: Rules): Array<Buffer> =>
  before.change.map((_key, at) =>
    run(before, before.change.slice(0, at + 1), { keys: knownKeys, pairs: rules.pairs }),
  );

const replay = (inner: Inner, frames: ReadonlyArray<Buffer>, turn: number): void => {
  const [frame, ...rest] = frames;
  const { session } = inner.state;
  if (frame === undefined || inner.state.turn !== turn) {
    return;
  }
  const final = finalText(session, inner.options.rules());
  if (rest.length === 0) {
    inner.screen.show(session.buffer, goalOf(session, inner.options.rules()));
    return;
  }
  inner.screen.show(frame, between(frame.text, final));
  setTimeout(() => {
    replay(inner, rest, turn);
  }, frameGap);
};

const celebrate = (inner: Inner, before: Buffer, key: string): void => {
  const effect = effectOf(before, inner.state.session.buffer, key);
  if (effect === null) {
    return;
  }
  inner.screen.flash(effectText(effect));
  inner.screen.show(inner.state.session.buffer, goalOf(inner.state.session, inner.options.rules()));
  if (effect.kind === 'repeat') {
    replay(inner, framesOf(before, inner.options.rules()), inner.state.turn);
  }
};

const handle = (inner: Inner, event: KeyboardEvent, key: string): void => {
  const { options, setSession, state } = inner;
  const before = state.session.buffer;
  event.preventDefault();
  event.stopPropagation();
  const pressed = press(state.session, key, options.rules());
  state.turn += 1;
  setSession(pressed.session);
  celebrate(inner, before, key);
  options.onPress(pressed);
};

const listen = (inner: Inner): void => {
  const { state } = inner;
  document.addEventListener(
    'keydown',
    (event) => {
      const key = keyFrom(event);
      if (!state.armed || state.sprite !== null || key === null || isElsewhere(event.target)) {
        return;
      }
      handle(inner, event, key);
    },
    { capture: true },
  );
};

const textOf = (state: State, ofSprite: boolean): string => {
  if (ofSprite && state.sprite !== null) {
    return state.sprite.text;
  }
  return state.session.buffer.text;
};

const createDesk = (options: Options): Desk => {
  const { parent } = options;
  const state: State = {
    armed: false,
    session: { at: 0, buffer: options.start, path: [] },
    sprite: null,
    turn: 0,
  };
  parent.replaceChildren();
  parent.dataset.actor = actorOf(null);
  const screen = createScreen(parent, options.start);
  const setSession = (session: Session): void => {
    const changed = session.buffer !== state.session.buffer;
    state.session = session;
    if (state.sprite === null) {
      screen.show(session.buffer, goalOf(session, options.rules()));
    }
    if (changed) {
      options.onChange(session.buffer);
    }
  };
  listen({ options, screen, setSession, state });
  return {
    blur: () => {
      parent.blur();
    },
    focus: () => {
      parent.focus({ preventScroll: true });
    },
    hush: () => {
      screen.hush();
    },
    session: () => state.session,
    setArmed: (armed) => {
      state.armed = armed;
      allowFocus(parent, armed);
    },
    setSession,
    showSprite: (buffer, goal) => {
      state.sprite = buffer;
      parent.dataset.actor = actorOf(buffer);
      if (buffer === null) {
        screen.show(state.session.buffer, goalOf(state.session, options.rules()));
      } else {
        screen.show(buffer, between(buffer.text, goal ?? buffer.text));
      }
    },
    text: (ofSprite) => textOf(state, ofSprite),
  };
};

export { createDesk, type Desk };
