import init, { Engine, keptKinds } from 'konekode-engine';

import { report } from '@/lib/fault/fault';
import { onRecorded, openLog } from '@/lib/record/current';
import {
  array,
  boolean,
  int,
  literal,
  nullable,
  object,
  record,
  string,
  union,
  type infer as Infer,
} from '@/lib/zod';
import { contentId } from '@/units/content';
import { engineContent } from '@/units/index';

import type { LearningEvent } from '@/lib/record/event';

const componentSchema = object({
  completed: int(),
  firstRight: int(),
  id: string(),
  opportunities: int(),
  shown: int(),
  standing: union([literal('done'), literal('shown'), literal('unseen')]),
  unsettled: boolean(),
});

const unitSchema = object({ passed: array(string()), position: nullable(string()) });

const stateSchema = object({
  components: array(componentSchema),
  units: record(string(), unitSchema),
  unlocked: array(string()),
});

type EngineComponent = Infer<typeof componentSchema>;
type EngineState = Infer<typeof stateSchema>;

interface UnitState {
  readonly passed: ReadonlySet<string>;
  readonly position: string | null;
}

interface Ready {
  readonly engine: Engine;
  readonly kept: ReadonlySet<string>;
}

const nothing: ReadonlyArray<string> = [];
const blank: EngineState = { components: [], units: {}, unlocked: [] };

let ready: Ready | null = null;
let opening: Promise<Ready> | null = null;
let state: EngineState | null = null;
let unlocked: ReadonlySet<string> | null = null;

const feed = (event: LearningEvent): void => {
  if (ready === null) {
    return;
  }
  try {
    ready.engine.push(JSON.stringify(event));
    state = null;
    unlocked = null;
  } catch (error) {
    report('engine.push', event.kind, error);
  }
};

const start = async (): Promise<Ready> => {
  const [log, version] = await Promise.all([openLog(), contentId(), init()]);
  const engine = new Engine(engineContent(version), JSON.stringify(log.events()));
  ready = { engine, kept: new Set(keptKinds()) };
  onRecorded(feed);
  return ready;
};

const opened = async (): Promise<Ready> => {
  try {
    return await start();
  } catch (error) {
    report('engine.open', 'start', error);
    throw error;
  }
};

const openEngine = async (): Promise<void> => {
  opening ??= opened();
  await opening;
};

const currentState = (): EngineState => {
  if (ready === null) {
    return blank;
  }
  state ??= stateSchema.parse(JSON.parse(ready.engine.state()));
  return state;
};

const unitProgress = (unit: string): UnitState => {
  const found = currentState().units[unit];
  return { passed: new Set(found?.passed), position: found?.position ?? null };
};

const unlockedNow = (): ReadonlySet<string> => {
  unlocked ??= new Set(currentState().unlocked);
  return unlocked;
};

const engineComponents = (): ReadonlyArray<EngineComponent> => currentState().components;

const asked = (where: string): Engine | null => {
  if (ready === null) {
    report('engine.early', where, new Error('the engine was not open yet'));
    return null;
  }
  return ready.engine;
};

const shownAt = (unit: string, beat: string): ReadonlyArray<string> =>
  asked('shows')?.shows(unit, beat) ?? nothing;

const usedAt = (unit: string, beat: string, step: number): ReadonlyArray<string> =>
  asked('uses')?.uses(unit, beat, step) ?? nothing;

const keptKindsNow = (): ReadonlySet<string> | null => ready?.kept ?? null;

export {
  engineComponents,
  keptKindsNow,
  openEngine,
  shownAt,
  unitProgress,
  unlockedNow,
  usedAt,
  type EngineComponent,
  type UnitState,
};
