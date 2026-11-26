import { Command, Component, UiSchema } from '@effect/ui';
import { Schema } from 'effect';

const Check = Schema.Literals(['drill', 'run']);

const Happened = UiSchema.TaggedEnum({
  FinishedRun: {
    beat: Schema.String,
    by: Schema.Literals(['sprite', 'student']),
    state: Schema.String,
  },
  FinishedUnit: { unit: Schema.String },
  LoadedCompiler: {},
  MissedCheck: { beat: Schema.String, kind: Check },
  PassedCheck: { beat: Schema.String, kind: Check },
  PressedRightKey: { beat: Schema.String, key: Schema.String },
  PressedWrongKey: { beat: Schema.String, key: Schema.String },
  ReachedBeat: { beat: Schema.String, stage: Schema.String },
});
type Happened = typeof Happened.Type;

class PlayCue extends Command.Service<PlayCue>()('cues/PlayCue', {
  args: { happened: Happened },
  mode: 'queue',
  success: Component.Noop,
}) {}

type ActionVariant = 'icon' | 'primary' | 'quiet' | 'secondary';

interface ActionOptions<Msg> {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: Msg;
  readonly variant: ActionVariant;
}

type DialogueState = 'revealing' | 'shown' | 'student';

interface DialogueLine {
  readonly id: string;
  readonly text: string;
}

interface DialogueOptions<Msg> {
  readonly lines: readonly DialogueLine[];
  readonly more: boolean;
  readonly note: string;
  readonly onPress: Msg;
  readonly state: DialogueState;
  readonly who: string;
}

interface ChapterOptions {
  readonly name: string;
  readonly number: string;
}

type PaperState = 'editing' | 'passed' | 'reading' | 'running';

interface PaperOptions<Body> {
  readonly body: Body;
  readonly hint: string;
  readonly mode: string;
  readonly owner: 'sprite' | 'student';
  readonly state: PaperState;
  readonly title: string;
}

type CellKind = 'expect' | 'input' | 'output';
type CellState = 'empty' | 'error' | 'ok' | 'value';

interface CellOptions {
  readonly kind: CellKind;
  readonly label: string;
  readonly state: CellState;
  readonly status: string;
  readonly text: string;
}

interface SnippetOptions {
  readonly text: string;
}

type KeyState = 'idle' | 'right' | 'wanted' | 'wrong';

interface KeyCapView {
  readonly key: string;
  readonly label: string;
  readonly state: KeyState;
  readonly wide: boolean;
}

interface KeyboardOptions {
  readonly mode: string;
  readonly rows: readonly (readonly KeyCapView[])[];
}

type NoticeKind = 'blocked' | 'broken' | 'unsaved';

interface NoticeOptions {
  readonly kind: NoticeKind;
  readonly text: string;
}

type ProgressState = 'done' | 'failed' | 'running';

interface ProgressOptions {
  readonly label: string;
  readonly percent: number;
  readonly state: ProgressState;
}

export {
  Happened,
  PlayCue,
  type ActionOptions,
  type ActionVariant,
  type CellKind,
  type CellOptions,
  type CellState,
  type ChapterOptions,
  type DialogueLine,
  type DialogueOptions,
  type DialogueState,
  type KeyCapView,
  type KeyboardOptions,
  type KeyState,
  type NoticeKind,
  type NoticeOptions,
  type PaperOptions,
  type PaperState,
  type ProgressOptions,
  type ProgressState,
  type SnippetOptions,
};
