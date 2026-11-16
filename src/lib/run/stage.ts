import { array, boolean, object, string, type infer as Infer } from 'zod';

import { chunks } from '@/lib/perform/rhythm';

import { type Editor } from './editor';
import { textPrefix } from './puppet';

interface Step {
  readonly label: string;
  readonly token: string;
  readonly wait: number;
}

type Actor = 'sprite' | 'student';

interface State {
  acting: boolean;
  turn: number;
}

interface Tools {
  readonly arm: (armed: boolean) => void;
  readonly attend: (beat: string) => void;
  readonly clear: () => void;
  readonly forget: () => void;
  readonly keycap: HTMLElement;
  readonly run: () => void;
  readonly show: (actor: Actor) => void;
  readonly sprite: Editor;
  readonly student: Editor;
}

const stageSchema = object({
  active: boolean(),
  beat: string(),
  before: array(string()),
  focus: boolean(),
  now: array(string()),
});

type Stage = Infer<typeof stageSchema>;

const typePrefix = 'type:';
const keyPause = 450;
const labels: Record<string, string> = { BS: 'Backspace', run: 'Enter' };

const typing = (text: string): Step[] =>
  chunks(text).map((chunk) => ({
    label: '',
    token: `${textPrefix}${chunk.text}`,
    wait: chunk.pause,
  }));

const expandOne = (token: string): Step[] => {
  if (token === 'reset') {
    return [];
  }
  if (token.startsWith(typePrefix)) {
    return typing(token.slice(typePrefix.length));
  }
  return [{ label: labels[token] ?? token, token, wait: keyPause }];
};

const expand = (tokens: readonly string[]): Step[] => tokens.flatMap((token) => expandOne(token));

const pause = async (time: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, time);
  await promise;
};

const perform = (tools: Tools, step: Step): void => {
  if (step.label !== '') {
    tools.keycap.textContent = step.label;
  }
  if (step.token === 'run') {
    tools.run();
    return;
  }
  tools.sprite.press(step.token);
};

const play = async (tools: Tools, state: State, steps: readonly Step[]): Promise<void> => {
  const mine = state.turn;
  const [step, ...rest] = steps;
  if (step === undefined) {
    tools.keycap.textContent = '';
    return;
  }
  perform(tools, step);
  if (step.wait > 0) {
    await pause(step.wait);
  }
  if (state.turn === mine) {
    await play(tools, state, rest);
  }
};

const settle = (tools: Tools, state: State, focus: boolean): void => {
  if (state.acting) {
    state.acting = false;
    tools.clear();
    tools.forget();
  }
  tools.show('student');
  tools.arm(focus);
  if (focus) {
    tools.student.focus();
    return;
  }
  tools.student.blur();
};

const demonstrate = (tools: Tools, state: State, stage: Stage): void => {
  state.acting = true;
  tools.arm(false);
  tools.student.blur();
  tools.sprite.restore(tools.student.snapshot());
  tools.show('sprite');
  tools.clear();
  for (const step of expand(stage.before)) {
    if (step.token !== 'run') {
      tools.sprite.press(step.token);
    }
  }
  void play(tools, state, expand(stage.now));
};

const createStage = (tools: Tools): ((detail: unknown) => void) => {
  const state: State = { acting: false, turn: 0 };
  return (detail) => {
    const stage = stageSchema.parse(detail);
    state.turn += 1;
    tools.attend(stage.beat);
    tools.keycap.textContent = '';
    if (stage.active) {
      demonstrate(tools, state, stage);
      return;
    }
    settle(tools, state, stage.focus);
  };
};

export { createStage, type Actor };
