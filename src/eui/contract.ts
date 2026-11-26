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
  MissedCheck: { beat: Schema.String, kind: Check },
  PassedCheck: { beat: Schema.String, kind: Check },
  PressedWrongKey: { beat: Schema.String, key: Schema.String },
  ReachedBeat: { beat: Schema.String, stage: Schema.String },
});
type Happened = typeof Happened.Type;

type ActionVariant = 'primary' | 'quiet' | 'secondary';

interface ActionOptions<Msg> {
  readonly disabled: boolean;
  readonly label: string;
  readonly onPress: Msg;
  readonly variant: ActionVariant;
}

class PlayCue extends Command.Service<PlayCue>()('cues/PlayCue', {
  args: { happened: Happened },
  mode: 'queue',
  success: Component.Noop,
}) {}

export { Happened, PlayCue, type ActionOptions, type ActionVariant };
