import { array, boolean, object, string, type infer as Infer } from 'zod';

import { chunks } from '@/lib/perform/rhythm';
import { type Plan } from '@/lib/unit/format';

import { type Editor } from './editor';
import { textPrefix, type Snapshot } from './puppet';

interface Step {
  readonly label: string;
  readonly token: string;
  readonly wait: number;
}

type Actor = 'sprite' | 'student';

interface State {
  acting: boolean;
  fresh: boolean;
  guided: string;
  readonly starts: Map<string, Snapshot>;
  turn: number;
  turnBeat: string;
}

interface Tools {
  readonly arm: (armed: boolean) => void;
  readonly attend: (beat: string) => void;
  readonly clear: () => void;
  readonly forget: () => void;
  readonly fresh: boolean;
  readonly guided: (active: boolean) => void;
  readonly keycap: HTMLElement;
  readonly origin: Snapshot;
  readonly plan: (beat: string) => Plan | null;
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

const replay = (tools: Tools, tokens: readonly string[]): void => {
  for (const step of expand(tokens)) {
    if (step.token !== 'run') {
      tools.sprite.press(step.token);
    }
  }
};

const rewind = (tools: Tools, history: readonly string[]): void => {
  tools.sprite.restore(tools.origin);
  replay(tools, history);
};

const release = (tools: Tools, state: State): void => {
  if (state.guided !== '') {
    state.guided = '';
    tools.student.guide(null);
  }
};

interface Turn {
  readonly beat: string;
  readonly plan: Plan;
  readonly state: State;
  readonly tools: Tools;
}

const startOf = ({ beat, plan, state, tools }: Turn): Snapshot => {
  const known = state.starts.get(beat);
  if (known !== undefined) {
    return known;
  }
  tools.show('sprite');
  rewind(tools, plan.history);
  const start = tools.sprite.snapshot();
  tools.show('student');
  tools.forget();
  state.starts.set(beat, start);
  return start;
};

const place = (turn: Turn): void => {
  const start = startOf(turn);
  const now = turn.tools.student.snapshot();
  if (now.text !== start.text || now.cursor !== start.cursor) {
    turn.tools.student.restore(start);
  }
};

const needsStart = ({ plan, state }: Turn): boolean => state.fresh && plan.history.length > 0;

const placeOnce = (turn: Turn): void => {
  if (needsStart(turn)) {
    place(turn);
  }
};

const lead = (tools: Tools, state: State, beat: string): void => {
  const plan = tools.plan(beat);
  if (plan === null || state.guided === beat) {
    return;
  }
  const turn: Turn = { beat, plan, state, tools };
  if (plan.path.length === 0) {
    placeOnce(turn);
    return;
  }
  place(turn);
  tools.student.guide(plan.path);
  state.guided = beat;
};

const takeTurn = (tools: Tools, state: State, beat: string): void => {
  if (state.turnBeat !== beat) {
    state.turnBeat = beat;
    tools.clear();
  }
  lead(tools, state, beat);
};

const leaveDemo = (tools: Tools, state: State): void => {
  if (state.acting) {
    state.acting = false;
    tools.clear();
    tools.forget();
  }
  tools.show('student');
};

const rest = (tools: Tools, state: State, beat: string): void => {
  release(tools, state);
  const plan = tools.plan(beat);
  if (plan !== null && plan.path.length === 0) {
    placeOnce({ beat, plan, state, tools });
  }
};

const handOver = (tools: Tools, state: State, stage: Stage): void => {
  if (stage.focus) {
    takeTurn(tools, state, stage.beat);
    return;
  }
  rest(tools, state, stage.beat);
};

const settle = (tools: Tools, state: State, stage: Stage): void => {
  leaveDemo(tools, state);
  handOver(tools, state, stage);
  state.fresh = false;
  tools.arm(stage.focus);
  tools.guided(state.guided !== '');
  if (stage.focus) {
    tools.student.focus();
    return;
  }
  tools.student.blur();
};

const demonstrate = (tools: Tools, state: State, stage: Stage): void => {
  state.acting = true;
  release(tools, state);
  tools.guided(false);
  tools.arm(false);
  tools.student.blur();
  tools.show('sprite');
  rewind(tools, tools.plan(stage.beat)?.history ?? []);
  tools.clear();
  replay(tools, stage.before);
  void play(tools, state, expand(stage.now));
};

const createStage = (tools: Tools): ((detail: unknown) => void) => {
  const state: State = {
    acting: false,
    fresh: tools.fresh,
    guided: '',
    starts: new Map(),
    turn: 0,
    turnBeat: '',
  };
  return (detail) => {
    const stage = stageSchema.parse(detail);
    state.turn += 1;
    tools.attend(stage.beat);
    tools.keycap.textContent = '';
    if (stage.active) {
      demonstrate(tools, state, stage);
      return;
    }
    settle(tools, state, stage);
  };
};

export { createStage, type Actor };
