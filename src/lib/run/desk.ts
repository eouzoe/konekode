import { type Buffer, type Rules } from '@/lib/edit/buffer';
import { press, type Pressed, type Session } from '@/lib/edit/session';

import { createScreen } from './screen';

interface Desk {
  readonly blur: () => void;
  readonly focus: () => void;
  readonly session: () => Session;
  readonly setArmed: (armed: boolean) => void;
  readonly setSession: (session: Session) => void;
  readonly showSprite: (buffer: Buffer | null) => void;
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
  'ScrollLock',
  'Shift',
  'Tab',
]);
const arrows = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp']);
const functionKey = /^F\d+$/u;

const isShortcut = (event: KeyboardEvent): boolean =>
  event.ctrlKey || event.metaKey || event.altKey;

const isPassed = (event: KeyboardEvent, inserting: boolean): boolean =>
  ignored.has(event.key) || functionKey.test(event.key) || (arrows.has(event.key) && !inserting);

const keyFrom = (event: KeyboardEvent, inserting: boolean): string | null => {
  if (isShortcut(event) || isPassed(event, inserting)) {
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
  readonly setSession: (session: Session) => void;
  readonly state: State;
}

const isElsewhere = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('dialog, input, textarea, select') !== null;

const listen = ({ options, setSession, state }: Inner): void => {
  document.addEventListener(
    'keydown',
    (event) => {
      const key = keyFrom(event, state.session.buffer.mode === 'insert');
      if (!state.armed || state.sprite !== null || key === null || isElsewhere(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const pressed = press(state.session, key, options.rules());
      setSession(pressed.session);
      options.onPress(pressed);
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
  };
  parent.replaceChildren();
  parent.dataset.actor = actorOf(null);
  const screen = createScreen(parent, options.start);
  const setSession = (session: Session): void => {
    const changed = session.buffer !== state.session.buffer;
    state.session = session;
    if (state.sprite === null) {
      screen.show(session.buffer);
    }
    if (changed) {
      options.onChange(session.buffer);
    }
  };
  listen({ options, setSession, state });
  return {
    blur: () => {
      parent.blur();
    },
    focus: () => {
      parent.focus({ preventScroll: true });
    },
    session: () => state.session,
    setArmed: (armed) => {
      state.armed = armed;
      allowFocus(parent, armed);
    },
    setSession,
    showSprite: (buffer) => {
      state.sprite = buffer;
      parent.dataset.actor = actorOf(buffer);
      screen.show(buffer ?? state.session.buffer);
    },
    text: (ofSprite) => textOf(state, ofSprite),
  };
};

export { createDesk, type Desk };
