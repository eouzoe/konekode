import { Command, Subscription, UiSchema } from '@effect/ui';
import { Html, HtmlSubscription } from '@effect/ui/html';
import { Duration, Schema, Stream } from 'effect';

import { createBuffer } from '@/lib/edit/buffer';
import { press as pressDesk, type Session } from '@/lib/edit/session';
import { diagnose } from '@/lib/run/diagnose';
import { freeHint, quietHint, wrongHint } from '@/lib/run/view';
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
} from '@/lib/typing/drill';
import { Action } from '@/parts/action';
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
} from './commands';
import { Happened, PlayCue } from './contract';
import {
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
  full: Schema.Boolean,
  hint: Schema.String,
  index: Schema.Number,
  keycap: Schema.String,
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
    hint: gate ? quietHint(student) : '',
    keycap: '',
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
  const updated = { ...model, drill: next };
  if (isDone(before) || !isDone(next)) {
    return { commands: [], model: updated };
  }
  const flow = checked(beats, flowOf(updated), where, { kind: 'drill', output: '' });
  const beat = currentOf(beats, flowOf(model));
  return {
    commands:
      beat === undefined
        ? []
        : [
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
  const updated = { ...model, hint, student: pressed.session };
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
  full,
  hint: '',
  index: 0,
  keycap: '',
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

const lineView = LessonDef.fragment((h, text: string, cursor: number | null, at: number) => {
  if (cursor === null || cursor < at || cursor > at + text.length) {
    return h.span.class('line').children(text === '' ? ' ' : text);
  }
  const offset = cursor - at;
  return h.span
    .class('line')
    .children(
      text.slice(0, offset),
      h.span.class('cursor').children(text.charAt(offset) === '' ? ' ' : text.charAt(offset)),
      text.slice(offset + 1),
    );
});

const bufferView = LessonDef.fragment(
  (h, text: string, cursor: number, mode: string, owner: string) => {
    let at = 0;
    const lines = text.split('\n').map((line) => {
      const view = lineView(h, line, cursor, at);
      at += line.length + 1;
      return view;
    });
    return h.div
      .class('desk')
      .attr('data-owner', owner)
      .attr('data-mode', mode)
      .children(
        h.pre.class('buffer').children(lines),
        h.p.class('mode').children(mode === 'insert' ? '-- INSERT --' : ''),
      );
  },
);

const codeView = LessonDef.fragment((h, model: LessonModel) => {
  const marked = new Set((beats[model.index]?.lines ?? '').split(','));
  return h.div.class('code').children(
    template.split('\n').map((line, at) =>
      h.span
        .class('line')
        .attr('data-marked', String(marked.has(String(at + 1))))
        .children(line === '' ? ' ' : line),
    ),
  );
});

const drillView = LessonDef.fragment((h, model: LessonModel) => {
  const drill = model.drillShow?.demo === true ? model.drillShow.show : model.drill;
  const done = drill.target.slice(0, drill.position);
  const next = expectedChar(drill);
  const rest = drill.target.slice(drill.position + 1);
  return h.div
    .class('drill')
    .attr('data-demo', String(model.drillShow?.demo === true))
    .attr('data-feedback', drill.feedback)
    .children(
      h.pre
        .class('target')
        .children(
          h.span.class('typed').children(done),
          h.span.class('next').children(next === '\n' ? '↵\n' : next),
          h.span.class('rest').children(rest),
        ),
      h.p.class('mode').children(drill.mode === 'insert' ? '-- INSERT --' : 'NORMAL'),
      drill.feedback === 'none' ? null : h.p.class('feedback').children(drill.feedback),
    );
});

const runView = LessonDef.fragment((h, model: LessonModel) => {
  const beat = beats[model.index];
  const desk =
    model.sprite === null
      ? bufferView(
          h,
          model.student.buffer.text,
          model.student.buffer.cursor,
          model.student.buffer.mode,
          'student',
        )
      : bufferView(h, model.sprite.text, model.sprite.cursor, model.sprite.mode, 'sprite');
  return h.div.class('run').children(
    beat?.snippet === undefined ? null : h.pre.class('snippet').children(beat.snippet),
    desk,
    model.keycap === '' ? null : h.p.class('keycap').children(model.keycap),
    model.hint === '' ? null : h.p.class('hint').children(model.hint),
    beat?.input === undefined
      ? null
      : h.div.class('field').children(h.p(ui['page.input']), h.pre(beat.input)),
    beat?.expect === undefined
      ? null
      : h.div.class('field').children(h.p(ui['page.expect']), h.pre(beat.expect)),
    h.div
      .class('output')
      .attr('data-state', model.busy ? 'busy' : (model.ran?.state ?? 'idle'))
      .children(
        h.p.class('status').children(model.busy ? ui['run.running'] : (model.ran?.status ?? '')),
        h.pre.attr('data-role', 'output').children(model.ran?.text ?? ''),
      ),
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

const wordsView = LessonDef.fragment((h, model: LessonModel) =>
  h.div.class('words').children(
    beats.map((beat, at) => {
      if (model.phase === 'loading') {
        return h.p
          .key(beat.id)
          .attr('data-beat-id', beat.id)
          .class(at > 0 && 'later')
          .children(sayOf(at));
      }
      if (!isShown(beats, model.index, at)) {
        return null;
      }
      const text = at === model.index ? partOf(at, model.shown) : sayOf(at);
      return h.p.key(beat.id).attr('data-beat-id', beat.id).children(text);
    }),
  ),
);

const Lesson = LessonDef.make({
  init: ($) => initial($.props.full),
  subscriptions: ({ model }) => [
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
          ),
    ChangedFullscreen: ($, { full }) => $.evolve({ full }),
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
      const index = startAt(beats, position);
      const out = enter(
        { ...$.model, index, passed, phase: 'revealing', unlocked },
        $.props.unit,
        $.props.calm,
      );
      return $.set(out.model).run(...out.commands);
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
        h.div.class('stage').children(stageView(h, model)),
        h.div.class('dialogue').children(
          h.span.class('who').children(ui['page.who']),
          wordsView(h, model),
          h.p.class('note').attr('aria-live', 'polite').children(model.note),
          h.div.class('tools').children(
            Action(h, {
              disabled: false,
              label: ui['page.back'],
              onPress: LessonMessage.ClickedBack(),
              variant: 'secondary',
            }),
            Action(h, {
              disabled: model.phase === 'blocked',
              label: ui['page.next'],
              onPress: LessonMessage.ClickedNext(),
              variant: 'primary',
            }),
            Action(h, {
              disabled: false,
              label: ui['page.restart'],
              onPress: LessonMessage.ClickedRestart(),
              variant: 'quiet',
            }),
          ),
        ),
      ),
});

export { Lesson, LessonMessage, LessonModel, initial };
