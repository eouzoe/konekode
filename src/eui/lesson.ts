import { Command, Subscription, UiSchema } from '@effect/ui';
import { Html, HtmlSubscription } from '@effect/ui/html';
import { Duration, Effect, Queue, Schema, Stream } from 'effect';

import { createBuffer } from '@/lib/edit/buffer';
import { effectOf } from '@/lib/edit/effect';
import { between, goalOf } from '@/lib/edit/goal';
import { press as pressDesk, type Session } from '@/lib/edit/session';
import { diagnose } from '@/lib/run/diagnose';
import { busyStatus } from '@/lib/run/outcome';
import { watchLoading } from '@/lib/run/runner';
import { effectText, freeHint, quietHint, wrongHint } from '@/lib/run/view';
import { fullscreenMark } from '@/lib/scene/conditions';
import { fullscreenKeys } from '@/lib/site/device';
import { ui } from '@/lib/text/ui';
import {
  createDrill,
  escape,
  expectedChar,
  isDone,
  press as pressDrill,
  remind,
  type Drill,
} from '@/lib/typing/drill';
import { Action } from '@/parts/action';
import { Cell } from '@/parts/cell';
import { Dialogue } from '@/parts/dialogue';
import { Keyboard } from '@/parts/keyboard';
import { Paper } from '@/parts/paper';
import { Progress } from '@/parts/progress';
import { Snippet } from '@/parts/snippet';
import { beats, starter, template } from '@/units/start';

import {
  NoteCheck,
  NoteReached,
  NoteUnlock,
  OpenEngine,
  RestartUnit,
  RunProgram,
  RunView,
  Runner,
  WaitBeforeAuto,
  WaitBeforeStep,
  WarmCompiler,
} from './commands';
import {
  Happened,
  PlayCue,
  type CellState,
  type DialogueLine,
  type DialogueState,
  type PaperState,
} from './contract';
import { ShowCode } from './editor';
import {
  adapted,
  checked,
  currentOf,
  goBack,
  goNext,
  isShown,
  played,
  revealed,
  settle,
  startAt,
  type Flow,
  type Where,
} from './flow';
import { drillHint, keyboardOf, keyOf, modeLabel } from './keys';
import { drillStart, drillStep, rulesOf, runStart, runStep, studentTurn } from './sprite';

const Mode = Schema.Literals(['insert', 'normal']);
const BufferModel = Schema.Struct({
  auto: Schema.Number,
  change: Schema.Array(Schema.String),
  cursor: Schema.Number,
  fresh: Schema.Boolean,
  mode: Mode,
  pending: Schema.String,
  text: Schema.String,
  typing: Schema.Array(Schema.String),
  want: Schema.Number,
});
const Expected = Schema.Struct({
  key: Schema.String,
  kind: Schema.Literals(['command', 'run', 'text']),
});
const SessionModel = Schema.Struct({
  at: Schema.Number,
  buffer: BufferModel,
  path: Schema.Array(Expected),
});
const DrillModel = Schema.Struct({
  feedback: Schema.Literals(['need-insert', 'no-delete', 'none', 'wrong-key']),
  mistakes: Schema.Number,
  mode: Mode,
  position: Schema.Number,
  target: Schema.String,
});
const DrillShow = Schema.Struct({
  demo: Schema.Boolean,
  guide: Schema.Boolean,
  pretend: Schema.String,
  show: DrillModel,
});
const Move = Schema.Struct({
  keys: Schema.Array(Schema.String),
  label: Schema.String,
  runs: Schema.Boolean,
  wait: Schema.Number,
});

const LessonProps = Schema.Struct({
  calm: Schema.Boolean,
  fine: Schema.Boolean,
  full: Schema.Boolean,
  unit: Schema.String,
});

const LessonModel = Schema.Struct({
  busy: Schema.Boolean,
  drill: DrillModel,
  drillQueue: Schema.Array(Schema.String),
  drillShow: Schema.NullOr(DrillShow),
  flash: Schema.String,
  flashes: Schema.Number,
  full: Schema.Boolean,
  goal: Schema.String,
  hint: Schema.String,
  index: Schema.Number,
  keycap: Schema.String,
  lastKey: Schema.NullOr(Schema.Struct({ key: Schema.String, right: Schema.Boolean })),
  loaded: Schema.Number,
  mismatch: Schema.Boolean,
  moves: Schema.Array(Move),
  note: Schema.String,
  opening: Schema.Boolean,
  passed: Schema.Array(Schema.String),
  phase: Schema.Literals(['blocked', 'loading', 'ready', 'revealing']),
  ran: Schema.NullOr(RunView),
  shown: Schema.Number,
  sprite: Schema.NullOr(BufferModel),
  student: SessionModel,
  token: Schema.Number,
  unlocked: Schema.Array(Schema.String),
});
type LessonModel = typeof LessonModel.Type;

const LessonMessage = UiSchema.TaggedEnum({
  Booted: {},
  ChangedFullscreen: { full: Schema.Boolean },
  ClickedBack: {},
  ClickedNext: {},
  ClickedRestart: {},
  CompletedOpenEngine: {
    passed: Schema.Array(Schema.String),
    position: Schema.NullOr(Schema.String),
    unlocked: Schema.Array(Schema.String),
  },
  CompletedRunProgram: {
    by: Runner,
    finished: Schema.Boolean,
    output: Schema.String,
    token: Schema.Number,
    view: RunView,
  },
  CompletedWaitAuto: { token: Schema.Number },
  CompletedWaitStep: { token: Schema.Number },
  LoadedCompiler: { percent: Schema.Number },
  PressedKey: { key: Schema.String },
  TickedReveal: {},
});

const LessonDef = Html.component({
  message: LessonMessage,
  model: LessonModel,
  name: 'Lesson',
  props: LessonProps,
});

const revealPace = 30;
const complete = 100;
const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });
const keyLabel = ui[fullscreenKeys.pc];
const backwardKeys = new Set(['ArrowLeft', 'ArrowUp', 'PageUp']);
const forwardKeys = new Set(['ArrowDown', 'ArrowRight', 'Enter', 'PageDown']);
const ignoredKeys = new Set([
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

const sayOf = (index: number): string =>
  (beats[index]?.say ?? '').split(fullscreenMark).join(keyLabel);
const lengthOf = (index: number): number => [...segmenter.segment(sayOf(index))].length;
const partOf = (index: number, count: number): string =>
  Array.from(segmenter.segment(sayOf(index)), (part) => part.segment)
    .slice(0, count)
    .join('');

const flowOf = (model: LessonModel): Flow => ({
  index: model.index,
  mismatch: model.mismatch,
  passed: model.passed,
  phase: model.phase,
});

const whereOf = (model: LessonModel, fine: boolean): Where => ({ fine, full: model.full });

const intentOf = (key: string): 'backward' | 'forward' | 'none' => {
  if (backwardKeys.has(key)) {
    return 'backward';
  }
  if (forwardKeys.has(key) || key.length === 1) {
    return 'forward';
  }
  return 'none';
};

const stepCommand = (token: number, delay: number) =>
  WaitBeforeStep.make({ delay, token }).pipe(
    Command.map((done) => LessonMessage.CompletedWaitStep({ token: done })),
  );

const autoCommand = (token: number, delay: number) =>
  WaitBeforeAuto.make({ delay, token }).pipe(
    Command.map((done) => LessonMessage.CompletedWaitAuto({ token: done })),
  );

const cue = (happened: Happened) => PlayCue.make({ happened });

const runCommand = (by: 'sprite' | 'student', source: string, input: string, token: number) =>
  RunProgram.make({ by, input, source, token }).pipe(
    Command.map((result) => LessonMessage.CompletedRunProgram(result)),
  );

const quiet = <A>(command: Command.Command<A>) => command.pipe(Command.asNoop);

const withFlow = (model: LessonModel, flow: Flow): LessonModel => ({ ...model, ...flow });

const enter = (model: LessonModel, unit: string, calm: boolean) => {
  const token = model.token + 1;
  const beat = beats[model.index];
  const rules = rulesOf(model.unlocked);
  const fresh = [
    ...model.unlocked,
    ...(beat?.unlock ?? []).filter((item) => !model.unlocked.includes(item)),
  ];
  const drill = drillStart(beats, model.index, template);
  const demo = runStart(beats, model.index, unit, starter, rules);
  const gateBeat = beat?.wait === 'run' && !model.passed.includes(beat.id) ? beat : null;
  const gate = gateBeat !== null;
  const student: Session =
    gateBeat === null ? model.student : studentTurn(unit, gateBeat, starter, rules, model.student);
  const base: LessonModel = {
    ...model,
    drillQueue: drill?.queue ?? [],
    drillShow: drill?.state ?? null,
    goal: demo?.goal ?? model.goal,
    hint: gate ? quietHint(student) : '',
    keycap: '',
    lastKey: null,
    moves: demo?.queue ?? [],
    note: '',
    ran: demo !== null || gate ? null : model.ran,
    shown: model.phase === 'revealing' && !calm ? 0 : lengthOf(model.index),
    sprite: demo?.sprite ?? null,
    student,
    token,
    unlocked: fresh,
  };
  const settled =
    model.phase === 'revealing' && calm ? withFlow(base, settle(beats, flowOf(base))) : base;
  const playing = (drill?.queue.length ?? 0) > 0 || (demo?.queue.length ?? 0) > 0;
  return {
    commands: [
      quiet(NoteReached.make({ beat: beat?.id ?? '', unit })),
      cue(Happened.ReachedBeat({ beat: beat?.id ?? '', stage: beat?.stage ?? 'empty' })),
      ...(beat?.unlock ?? [])
        .filter((item) => !model.unlocked.includes(item))
        .map((item) => quiet(NoteUnlock.make({ item, unit }))),
      ...(playing ? [stepCommand(token, 0)] : []),
      ...(beat?.auto === undefined ? [] : [autoCommand(token, beat.auto)]),
    ],
    model: settled,
  };
};

const arrive = (model: LessonModel, flow: Flow | null, unit: string, calm: boolean) => {
  if (flow === null) {
    return { commands: [], model };
  }
  if (flow.index === model.index) {
    return { commands: [], model: withFlow(model, flow) };
  }
  return enter(withFlow(model, flow), unit, calm);
};

const drillKey = (model: LessonModel, key: string, unit: string, where: Where, calm: boolean) => {
  const before = model.drill;
  const next = (() => {
    if (key === 'Escape') {
      return escape(before);
    }
    if (key === 'Backspace' || key === 'Delete') {
      return remind(before, 'no-delete');
    }
    if (key === 'Enter') {
      return pressDrill(before, '\n');
    }
    if (key.length === 1) {
      return pressDrill(before, key);
    }
    return null;
  })();
  if (next === null) {
    return backwardKeys.has(key)
      ? arrive(model, goBack(beats, flowOf(model), where), unit, calm)
      : { commands: [], model };
  }
  const right = next.feedback !== 'wrong-key' && next.feedback !== 'need-insert';
  const updated = {
    ...model,
    drill: next,
    lastKey: { key: keyOf(key === 'Enter' ? '\n' : key), right },
  };
  const beatId = beats[model.index]?.id ?? '';
  const pressedCue = right
    ? cue(Happened.PressedRightKey({ beat: beatId, key }))
    : cue(Happened.PressedWrongKey({ beat: beatId, key }));
  if (isDone(before) || !isDone(next)) {
    return { commands: [pressedCue], model: updated };
  }
  const flow = checked(beats, flowOf(updated), where, { kind: 'drill', output: '' });
  const beat = currentOf(beats, flowOf(model));
  return {
    commands:
      beat === undefined
        ? []
        : [
            pressedCue,
            quiet(NoteCheck.make({ beat: beat.id, unit })),
            cue(Happened.PassedCheck({ beat: beat.id, kind: 'drill' })),
          ],
    model: flow === null ? updated : withFlow(updated, flow),
  };
};

const deskKey = (model: LessonModel, key: string) => {
  const pressed = pressDesk(model.student, key, rulesOf(model.unlocked));
  const hint = (() => {
    if (pressed.verdict === 'wrong') {
      return wrongHint(model.student, pressed);
    }
    if (pressed.expected === null && pressed.verdict !== 'right') {
      return freeHint(pressed);
    }
    return quietHint(pressed.session);
  })();
  const effect = effectOf(model.student.buffer, pressed.session.buffer, key);
  const updated = {
    ...model,
    flash: effect === null ? model.flash : effectText(effect),
    flashes: effect === null ? model.flashes : model.flashes + 1,
    hint,
    student: pressed.session,
  };
  const beat = beats[model.index];
  const wrong =
    pressed.verdict === 'wrong'
      ? [cue(Happened.PressedWrongKey({ beat: beat?.id ?? '', key }))]
      : [];
  if (!pressed.runs || model.busy) {
    return { commands: wrong, model: updated };
  }
  return {
    commands: [runCommand('student', pressed.session.buffer.text, beat?.input ?? '', model.token)],
    model: { ...updated, busy: true, note: '' },
  };
};

const onKey = (model: LessonModel, key: string, unit: string, where: Where, calm: boolean) => {
  const flow = flowOf(model);
  const beat = currentOf(beats, flow);
  if (model.phase === 'loading') {
    return { commands: [], model };
  }
  if (model.phase === 'revealing') {
    const intent = intentOf(key);
    if (intent === 'backward') {
      return arrive(model, goBack(beats, flow, where), unit, calm);
    }
    if (intent === 'forward') {
      return arrive({ ...model, shown: lengthOf(model.index) }, revealed(beats, flow), unit, calm);
    }
    return { commands: [], model };
  }
  if (model.phase === 'blocked' && beat?.wait === 'drill' && model.drillQueue.length === 0) {
    return drillKey(model, key, unit, where, calm);
  }
  if (model.phase === 'blocked' && beat?.wait === 'run') {
    return deskKey(model, key);
  }
  const intent = intentOf(key);
  if (intent === 'backward') {
    return arrive(model, goBack(beats, flow, where), unit, calm);
  }
  if (intent === 'forward') {
    return arrive(model, goNext(beats, flow, where), unit, calm);
  }
  return { commands: [], model };
};

const stepDemo = (model: LessonModel, unit: string, where: Where, calm: boolean) => {
  if (model.drillShow !== null && model.drillQueue.length > 0) {
    const next = drillStep(model.drillShow, model.drillQueue);
    const updated = { ...model, drillQueue: next.queue, drillShow: next.state };
    if (next.queue.length > 0) {
      return { commands: [stepCommand(model.token, next.delay)], model: updated };
    }
    return arrive(updated, played(beats, flowOf(updated), where), unit, calm);
  }
  if (model.sprite !== null && model.moves.length > 0) {
    const next = runStep(model.sprite, model.moves, rulesOf(model.unlocked));
    const keycap = model.moves[0]?.label ?? '';
    const updated = { ...model, keycap, moves: next.queue, sprite: next.state };
    const run = next.runs
      ? [runCommand('sprite', next.state.text, beats[model.index]?.input ?? '', model.token)]
      : [];
    if (next.queue.length > 0) {
      return { commands: [...run, stepCommand(model.token, next.delay)], model: updated };
    }
    const done = arrive(
      { ...updated, keycap: '' },
      played(beats, flowOf(updated), where),
      unit,
      calm,
    );
    return { commands: [...run, ...done.commands], model: done.model };
  }
  return { commands: [], model };
};

const initial = (full: boolean): LessonModel => ({
  busy: false,
  drill: createDrill(template),
  drillQueue: [],
  drillShow: null,
  flash: '',
  flashes: 0,
  full,
  goal: '',
  hint: '',
  index: 0,
  keycap: '',
  lastKey: null,
  loaded: 0,
  mismatch: false,
  moves: [],
  note: '',
  opening: false,
  passed: [],
  phase: 'loading',
  ran: null,
  shown: 0,
  sprite: null,
  student: { at: 0, buffer: createBuffer(starter), path: [] },
  token: 0,
  unlocked: [],
});

const codeView = LessonDef.fragment((h, model: LessonModel) => {
  const marked = new Set((beats[model.index]?.lines ?? '').split(','));
  const lines = h.pre.class('lines').children(
    template.split('\n').map((line, at) =>
      h.span
        .class('line')
        .attr('data-marked', String(marked.has(String(at + 1))))
        .children(line === '' ? ' ' : line),
    ),
  );
  return Paper(h, {
    body: [lines],
    editMode: null,
    hint: '',
    mode: '',
    owner: 'student',
    state: 'reading',
    title: '',
  });
});

const shownDrill = (model: LessonModel): Drill => {
  const shown = model.drillShow;
  if (shown?.demo === true) {
    return shown.show;
  }
  return model.drill;
};

const drillView = LessonDef.fragment((h, model: LessonModel) => {
  const demo = model.drillShow?.demo === true;
  const drill = shownDrill(model);
  const next = expectedChar(drill);
  const target = h.pre
    .class('target')
    .children(
      h.span.class('typed').children(drill.target.slice(0, drill.position)),
      h.span.class('next').children(next === '\n' ? '↵\n' : next),
      h.span.class('rest').children(drill.target.slice(drill.position + 1)),
    );
  return h.div.class('drill').children(
    Paper(h, {
      body: [target],
      editMode: drill.mode,
      hint: demo ? '' : drillHint(drill),
      mode: modeLabel(drill.mode),
      owner: demo ? 'sprite' : 'student',
      state: isDone(drill) ? 'passed' : 'editing',
      title: '',
    }),
    Keyboard(h, {
      mode: modeLabel(drill.mode),
      rows: keyboardOf(drill, demo ? null : model.lastKey),
    }),
  );
});

const outputState = (model: LessonModel): CellState => {
  if (model.busy) {
    return 'value';
  }
  if (model.ran === null) {
    return 'empty';
  }
  return model.ran.state === 'ok' ? 'ok' : 'error';
};

const paperState = (model: LessonModel): PaperState => {
  if (model.busy) {
    return 'running';
  }
  return model.phase === 'blocked' ? 'editing' : 'reading';
};

const runView = LessonDef.fragment((h, model: LessonModel) => {
  const beat = beats[model.index];
  const { sprite, student: session } = model;
  const shown = sprite ?? session.buffer;
  const hints =
    sprite === null ? goalOf(session, rulesOf(model.unlocked)) : between(sprite.text, model.goal);
  const code = h.div.class('screen').onMount(
    ShowCode({
      cursor: shown.cursor,
      flash: model.flash,
      flashes: model.flashes,
      hints,
      mode: shown.mode,
      text: shown.text,
    }),
  );
  return h.div.class('run').children(
    beat?.snippet === undefined ? null : Snippet(h, { text: beat.snippet }),
    Paper(h, {
      body: [code],
      editMode: shown.mode,
      hint: model.hint,
      mode: model.keycap === '' ? modeLabel(shown.mode) : model.keycap,
      owner: sprite === null ? 'student' : 'sprite',
      state: paperState(model),
      title: '',
    }),
    beat?.input === undefined
      ? null
      : Cell(h, {
          kind: 'input',
          label: ui['page.input'],
          state: 'value',
          status: '',
          text: beat.input,
        }),
    beat?.expect === undefined
      ? null
      : Cell(h, {
          kind: 'expect',
          label: ui['page.expect'],
          state: 'value',
          status: '',
          text: beat.expect,
        }),
    Cell(h, {
      kind: 'output',
      label: ui['page.output'],
      state: outputState(model),
      status: model.busy ? ui['run.running'] : (model.ran?.status ?? ''),
      text: model.ran?.text ?? '',
    }),
  );
});

const stageView = LessonDef.fragment((h, model: LessonModel) => {
  const stage = beats[model.index]?.stage ?? 'empty';
  if (stage === 'code') {
    return codeView(h, model);
  }
  if (stage === 'drill') {
    return drillView(h, model);
  }
  if (stage === 'run') {
    return runView(h, model);
  }
  return null;
});

const linesOf = (model: LessonModel): ReadonlyArray<DialogueLine> =>
  beats.flatMap((beat, at) => {
    if (!isShown(beats, model.index, at)) {
      return [];
    }
    return [{ id: beat.id, text: at === model.index ? partOf(at, model.shown) : sayOf(at) }];
  });

const dialogueState = (model: LessonModel): DialogueState => {
  if (model.phase === 'revealing') {
    return 'revealing';
  }
  return model.phase === 'blocked' ? 'student' : 'shown';
};

const loadingWords = LessonDef.fragment((h) =>
  h.div.class('words').children(
    beats.map((beat, at) =>
      h.p
        .key(beat.id)
        .attr('data-beat-id', beat.id)
        .class(at > 0 && 'later')
        .children(sayOf(at)),
    ),
  ),
);

const dialogueView = LessonDef.fragment((h, model: LessonModel) => {
  if (model.phase === 'loading') {
    return h.div
      .class('part-dialogue')
      .attr('data-part', 'dialogue')
      .children(h.span.class('who').children(ui['page.who']), loadingWords(h));
  }
  return Dialogue(h, {
    lines: linesOf(model),
    more: model.phase === 'ready',
    note: model.note,
    onPress: LessonMessage.ClickedNext(),
    state: dialogueState(model),
    who: ui['page.who'],
  });
});

const progressView = LessonDef.fragment((h, model: LessonModel) => {
  if (model.loaded >= complete || model.loaded === 0) {
    return null;
  }
  return Progress(h, {
    label: busyStatus(model.loaded),
    percent: model.loaded,
    state: 'running',
  });
});

const Lesson = LessonDef.make({
  init: ($) => initial($.props.full),
  subscriptions: ({ model }) => [
    model.opening &&
      model.loaded < complete &&
      Subscription.make('compiler', 'loading', () =>
        Stream.callback<ReturnType<typeof LessonMessage.LoadedCompiler>>((queue) =>
          Effect.sync(() => {
            watchLoading((percent) => {
              Queue.offerUnsafe(queue, LessonMessage.LoadedCompiler({ percent }));
            });
          }),
        ),
      ),
    model.phase === 'loading' &&
      !model.opening &&
      Subscription.make('boot', model.token, () => Stream.make(LessonMessage.Booted())),
    model.phase === 'revealing' &&
      Subscription.make('reveal', model.token, () =>
        Stream.tick(Duration.millis(revealPace)).pipe(
          Stream.drop(1),
          Stream.as(LessonMessage.TickedReveal()),
        ),
      ),
    HtmlSubscription.onDocument(
      'keydown',
      ({ alt, composing, ctrl, key, meta }) =>
        alt || ctrl || meta || composing || ignoredKeys.has(key) || /^F\d+$/u.test(key)
          ? undefined
          : LessonMessage.PressedKey({ key }),
      { capture: true, preventDefault: true },
    ),
    HtmlSubscription.onCustomEvent('fullscreenchange', () =>
      LessonMessage.ChangedFullscreen({ full: globalThis.document.fullscreenElement !== null }),
    ),
  ],
  update: {
    Booted: ($) =>
      $.model.opening
        ? $.model
        : $.evolve({ opening: true }).run(
            OpenEngine.make({ unit: $.props.unit }).pipe(
              Command.map((opened) => LessonMessage.CompletedOpenEngine(opened)),
            ),
            quiet(WarmCompiler.make()),
          ),
    ChangedFullscreen: ($, { full }) => {
      const model = { ...$.model, full };
      const out = arrive(
        model,
        adapted(beats, flowOf(model), whereOf(model, $.props.fine)),
        $.props.unit,
        $.props.calm,
      );
      return $.set(out.model).run(...out.commands);
    },
    ClickedBack: ($) => {
      const out = arrive(
        $.model,
        goBack(beats, flowOf($.model), whereOf($.model, $.props.fine)),
        $.props.unit,
        $.props.calm,
      );
      return $.set(out.model).run(...out.commands);
    },
    ClickedNext: ($) => {
      const out = onKey(
        $.model,
        'Enter',
        $.props.unit,
        whereOf($.model, $.props.fine),
        $.props.calm,
      );
      return $.set(out.model).run(...out.commands);
    },
    ClickedRestart: ($) => $.run(quiet(RestartUnit.make({ unit: $.props.unit }))),
    CompletedOpenEngine: ($, { passed, position, unlocked }) => {
      const index = startAt(beats, position, whereOf($.model, $.props.fine));
      const out = enter(
        { ...$.model, index, passed, phase: 'revealing', unlocked },
        $.props.unit,
        $.props.calm,
      );
      return $.set(out.model).run(
        cue(Happened.Entered({ page: `learn/${$.props.unit}` })),
        ...out.commands,
      );
    },
    CompletedRunProgram: ($, { by, finished, output, token, view }) => {
      const ran = { ...$.model, busy: by === 'student' ? false : $.model.busy, ran: view };
      const beat = beats[$.model.index];
      const finishedRun = cue(
        Happened.FinishedRun({ beat: beat?.id ?? '', by, state: view.state }),
      );
      if (by !== 'student' || token !== $.model.token || !finished || beat?.wait !== 'run') {
        return $.set(ran).run(finishedRun);
      }
      const flow = checked(beats, flowOf(ran), whereOf(ran, $.props.fine), { kind: 'run', output });
      if (flow === null) {
        return $.set(ran).run(finishedRun);
      }
      if (flow.mismatch) {
        return $.set({ ...withFlow(ran, flow), note: diagnose(beat.expect ?? '', output) }).run(
          finishedRun,
          cue(Happened.MissedCheck({ beat: beat.id, kind: 'run' })),
        );
      }
      const out = arrive(ran, flow, $.props.unit, $.props.calm);
      return $.set(out.model).run(
        quiet(NoteCheck.make({ beat: beat.id, unit: $.props.unit })),
        finishedRun,
        cue(Happened.PassedCheck({ beat: beat.id, kind: 'run' })),
        ...out.commands,
      );
    },
    CompletedWaitAuto: ($, { token }) => {
      if (token !== $.model.token || $.model.phase === 'blocked' || $.model.phase === 'loading') {
        return $.model;
      }
      const out = arrive(
        $.model,
        goNext(beats, flowOf($.model), whereOf($.model, $.props.fine)),
        $.props.unit,
        $.props.calm,
      );
      return $.set(out.model).run(...out.commands);
    },
    CompletedWaitStep: ($, { token }) => {
      if (token !== $.model.token) {
        return $.model;
      }
      const out = stepDemo($.model, $.props.unit, whereOf($.model, $.props.fine), $.props.calm);
      return $.set(out.model).run(...out.commands);
    },
    LoadedCompiler: ($, { percent }) =>
      percent >= complete && $.model.loaded < complete
        ? $.evolve({ loaded: percent }).run(cue(Happened.LoadedCompiler()))
        : $.evolve({ loaded: Math.max(percent, $.model.loaded) }),
    PressedKey: ($, { key }) => {
      const out = onKey($.model, key, $.props.unit, whereOf($.model, $.props.fine), $.props.calm);
      return $.set(out.model).run(...out.commands);
    },
    TickedReveal: ($) => {
      if ($.model.phase !== 'revealing') {
        return $.model;
      }
      const shown = $.model.shown + 1;
      if (shown < lengthOf($.model.index)) {
        return $.evolve({ shown });
      }
      const flow = revealed(beats, flowOf($.model));
      return flow === null ? $.evolve({ shown }) : $.set(withFlow({ ...$.model, shown }, flow));
    },
  },
  view: (h, model) =>
    h.section
      .class('scene')
      .attr('data-state', model.phase)
      .attr('data-beat', beats[model.index]?.id ?? '')
      .attr('data-stage', beats[model.index]?.stage ?? 'empty')
      .attr('data-busy', String(model.busy))
      .children(
        h.div.class('stage').children(progressView(h, model), stageView(h, model)),
        dialogueView(h, model),
        h.div.class('tools').children(
          Action(h, {
            busy: false,
            disabled: false,
            icon: 'back',
            label: ui['page.back'],
            onPress: LessonMessage.ClickedBack(),
            variant: 'secondary',
          }),
          Action(h, {
            busy: false,
            disabled: model.phase === 'blocked',
            icon: 'next',
            label: ui['page.next'],
            onPress: LessonMessage.ClickedNext(),
            variant: 'primary',
          }),
          Action(h, {
            busy: false,
            disabled: false,
            icon: 'restart',
            label: ui['page.restart'],
            onPress: LessonMessage.ClickedRestart(),
            variant: 'quiet',
          }),
        ),
      ),
});

export { Lesson, LessonMessage, LessonModel, initial };
