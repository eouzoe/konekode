import { createBuffer, type Buffer, type Rules } from '@/lib/edit/buffer';
import { expand, keysOf } from '@/lib/edit/path';
import { knownKeys, run } from '@/lib/edit/step';
import { guard } from '@/lib/fault/fault';
import { chunks } from '@/lib/perform/rhythm';
import { type Plan } from '@/lib/unit/format';
import { array, boolean, object, string, type infer as Infer } from '@/lib/zod';

import { type Desk } from './desk';

interface Move {
  readonly keys: readonly string[];
  readonly label: string;
  readonly runs: boolean;
  readonly wait: number;
}

interface State {
  acting: boolean;
  entered: string;
  fresh: boolean;
  goal: string;
  guided: string;
  sprite: Buffer;
  turn: number;
  turnBeat: string;
}

interface Tools {
  readonly arm: (armed: boolean) => void;
  readonly attend: (beat: string) => void;
  readonly clear: () => void;
  readonly desk: Desk;
  readonly entered: (mode: 'free' | 'guided') => void;
  readonly fresh: boolean;
  readonly guided: (active: boolean) => void;
  readonly keycap: HTMLElement;
  readonly origin: string;
  readonly plan: (beat: string) => Plan | null;
  readonly rules: () => Rules;
  readonly run: () => void;
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

const typing = (text: string): Move[] =>
  chunks(text).map((chunk) => ({
    keys: chunk.text.split(''),
    label: '',
    runs: false,
    wait: chunk.pause,
  }));

const movesOf = (token: string): Move[] => {
  if (token.startsWith(typePrefix)) {
    return typing(token.slice(typePrefix.length));
  }
  const keys = keysOf([token]);
  const runs = token === 'run';
  if (keys.length === 0 && !runs) {
    return [];
  }
  return [{ keys, label: labels[token] ?? token, runs, wait: keyPause }];
};

const pause = async (time: number): Promise<void> => {
  const { promise, resolve } = Promise.withResolvers<null>();
  setTimeout(() => {
    resolve(null);
  }, time);
  await promise;
};

const everything = (tools: Tools): Rules => ({ keys: knownKeys, pairs: tools.rules().pairs });

const startOf = (tools: Tools, history: readonly string[]): Buffer =>
  run(createBuffer(tools.origin), keysOf(history), everything(tools));

const perform = (tools: Tools, state: State, move: Move): void => {
  if (move.label !== '') {
    tools.keycap.textContent = move.label;
  }
  if (move.runs) {
    tools.run();
    return;
  }
  state.sprite = run(state.sprite, move.keys, everything(tools));
  tools.desk.showSprite(state.sprite, state.goal);
};

const play = async (tools: Tools, state: State, moves: readonly Move[]): Promise<void> => {
  const mine = state.turn;
  const [move, ...rest] = moves;
  if (move === undefined) {
    tools.keycap.textContent = '';
    return;
  }
  perform(tools, state, move);
  if (move.wait > 0) {
    await pause(move.wait);
  }
  if (state.turn === mine) {
    await play(tools, state, rest);
  }
};

const release = (tools: Tools, state: State): void => {
  state.entered = '';
  if (state.guided !== '') {
    state.guided = '';
    tools.desk.setSession({ ...tools.desk.session(), at: 0, path: [] });
  }
};

const placeOnce = (tools: Tools, state: State, plan: Plan): void => {
  if (state.fresh && plan.history.length > 0) {
    tools.desk.setSession({ at: 0, buffer: startOf(tools, plan.history), path: [] });
  }
};

const lead = (tools: Tools, state: State, beat: string): void => {
  const plan = tools.plan(beat);
  if (plan === null || state.guided === beat) {
    return;
  }
  if (plan.path.length === 0) {
    placeOnce(tools, state, plan);
    return;
  }
  const buffer = startOf(tools, plan.history);
  tools.desk.setSession({ at: 0, buffer, path: expand(plan.path) });
  state.guided = beat;
};

const modeOf = (plan: Plan | null): 'free' | 'guided' => {
  if (plan !== null && plan.path.length > 0) {
    return 'guided';
  }
  return 'free';
};

const enter = (tools: Tools, state: State, beat: string): void => {
  if (state.entered !== beat) {
    state.entered = beat;
    tools.entered(modeOf(tools.plan(beat)));
  }
};

const takeTurn = (tools: Tools, state: State, beat: string): void => {
  if (state.turnBeat !== beat) {
    state.turnBeat = beat;
    tools.clear();
  }
  lead(tools, state, beat);
  enter(tools, state, beat);
};

const leaveDemo = (tools: Tools, state: State): void => {
  if (state.acting) {
    state.acting = false;
    tools.clear();
  }
  tools.desk.showSprite(null);
};

const rest = (tools: Tools, state: State, beat: string): void => {
  release(tools, state);
  const plan = tools.plan(beat);
  if (plan?.path.length === 0) {
    placeOnce(tools, state, plan);
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
    tools.desk.focus();
    return;
  }
  tools.desk.blur();
};

const prepare = (tools: Tools, state: State, stage: Stage): void => {
  const plan = tools.plan(stage.beat);
  const start = startOf(tools, plan?.history ?? []);
  state.goal = run(start, keysOf(plan?.path ?? []), everything(tools)).text;
  state.sprite = run(start, keysOf(stage.before), everything(tools));
  tools.desk.showSprite(state.sprite, state.goal);
};

const demonstrate = (tools: Tools, state: State, stage: Stage): void => {
  state.acting = true;
  release(tools, state);
  tools.guided(false);
  tools.arm(false);
  tools.desk.blur();
  prepare(tools, state, stage);
  tools.clear();
  guard(
    'stage',
    play(
      tools,
      state,
      stage.now.flatMap((token) => movesOf(token)),
    ),
  );
};

const createStage = (tools: Tools): ((detail: unknown) => void) => {
  const state: State = {
    acting: false,
    entered: '',
    fresh: tools.fresh,
    goal: '',
    guided: '',
    sprite: createBuffer(tools.origin),
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

export { createStage };
