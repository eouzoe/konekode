import { array, boolean, object, parse, string, type InferOutput } from 'valibot';

import { type Editor } from './editor';
import { charPrefix, findPrefix, type Snapshot } from './puppet';

interface Step {
  readonly label: string;
  readonly token: string;
  readonly wait: number;
}

interface State {
  saved: Snapshot | null;
  turn: number;
}

interface Tools {
  readonly clear: () => void;
  readonly editor: Editor;
  readonly keycap: HTMLElement;
  readonly run: () => void;
}

const stageSchema = object({
  active: boolean(),
  before: array(string()),
  focus: boolean(),
  now: array(string()),
});

type Stage = InferOutput<typeof stageSchema>;

const typePrefix = 'type:';
const keyPause = 450;
const charPause = 55;
const labels: Record<string, string> = { BS: 'Backspace', run: 'Enter' };
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });

const expandOne = (token: string): Step[] => {
  if (token === 'reset') {
    return [];
  }
  if (token.startsWith(typePrefix)) {
    const text = token.slice(typePrefix.length);
    return Array.from(segmenter.segment(text), (part) => ({
      label: '',
      token: `${charPrefix}${part.segment}`,
      wait: charPause,
    }));
  }
  if (token.startsWith(findPrefix)) {
    return [{ label: '', token, wait: 0 }];
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
  tools.editor.press(step.token);
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
  if (state.saved !== null) {
    tools.editor.restore(state.saved);
    tools.clear();
    state.saved = null;
  }
  if (focus) {
    tools.editor.focus();
    return;
  }
  tools.editor.blur();
};

const demonstrate = (tools: Tools, state: State, stage: Stage): void => {
  state.saved ??= tools.editor.snapshot();
  tools.editor.restore(state.saved);
  tools.editor.blur();
  tools.clear();
  for (const step of expand(stage.before)) {
    if (step.token !== 'run') {
      tools.editor.press(step.token);
    }
  }
  void play(tools, state, expand(stage.now));
};

const createStage = (tools: Tools): ((detail: unknown) => void) => {
  const state: State = { saved: null, turn: 0 };
  return (detail) => {
    const stage = parse(stageSchema, detail);
    state.turn += 1;
    tools.keycap.textContent = '';
    if (stage.active) {
      demonstrate(tools, state, stage);
      return;
    }
    settle(tools, state, stage.focus);
  };
};

export { createStage };
