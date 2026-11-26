import { UiSchema, type View } from '@effect/ui';
import { Html } from '@effect/ui/html';
import { Schema } from 'effect';

import { ShowCode } from '@/eui/editor';

import { Action } from './action';
import { Cell } from './cell';
import { Chapter } from './chapter';
import { Dialogue } from './dialogue';
import { Keyboard } from './keyboard';
import { Notice } from './notice';
import { Paper } from './paper';
import { Progress } from './progress';
import { Snippet } from './snippet';

import type {
  ActionVariant,
  CellState,
  DialogueState,
  KeyCapView,
  KeyState,
  NoticeKind,
  PaperState,
  ProgressState,
} from '@/eui/contract';

const GalleryMessage = UiSchema.TaggedEnum({
  PressedAction: { variant: Schema.String },
  PressedDialogue: {},
});

const GalleryModel = Schema.Struct({ last: Schema.String, presses: Schema.Number });

const variants: ReadonlyArray<ActionVariant> = ['primary', 'secondary', 'quiet', 'icon'];
const dialogueStates: ReadonlyArray<DialogueState> = ['revealing', 'shown', 'student'];
const paperStates: ReadonlyArray<PaperState> = ['reading', 'editing', 'running', 'passed'];
const cellStates: ReadonlyArray<CellState> = ['empty', 'value', 'ok', 'error'];
const keyStates: ReadonlyArray<KeyState> = ['idle', 'wanted', 'right', 'wrong'];
const notices: ReadonlyArray<NoticeKind> = ['unsaved', 'blocked', 'broken'];
const progresses: ReadonlyArray<{ readonly percent: number; readonly state: ProgressState }> = [
  { percent: 40, state: 'running' },
  { percent: 100, state: 'done' },
  { percent: 70, state: 'failed' },
];
const sample =
  '#include <bits/stdc++.h>\nusing namespace std;\n\nint main()\n{\n    cout << 11;\n}';

const capsOf = (state: KeyState): ReadonlyArray<ReadonlyArray<KeyCapView>> => [
  [
    { key: 'i', label: 'I', state, wide: false },
    { key: 'Escape', label: 'Esc', state, wide: false },
    { key: 'Enter', label: 'Enter', state, wide: true },
  ],
];

const GalleryDef = Html.component({
  message: GalleryMessage,
  model: GalleryModel,
  name: 'Gallery',
});

const section = <M, C extends View.Children<M>>(h: Html.H<M>, title: string, items: C) =>
  h.section
    .class('gallery-section')
    .children(h.h2(title), h.div.class('gallery-row').children(items));

const Gallery = GalleryDef.make({
  init: () => ({ last: '', presses: 0 }),
  update: {
    PressedAction: ($, { variant }) => $.evolve({ last: variant, presses: (count) => count + 1 }),
    PressedDialogue: ($) => $.evolve({ last: 'dialogue', presses: (count) => count + 1 }),
  },
  view: (h, model) =>
    h.main.class('gallery').children(
      h.h1('部件總覽'),
      h.p.attr('data-role', 'pressed').children(`按了 ${String(model.presses)} 次：${model.last}`),
      section(h, '按鈕', [
        ...variants.map((variant) =>
          Action(h, {
            busy: false,
            disabled: false,
            icon: variant === 'icon' ? 'settings' : null,
            label: variant,
            onPress: GalleryMessage.PressedAction({ variant }),
            variant,
          }),
        ),
        Action(h, {
          busy: false,
          disabled: true,
          icon: null,
          label: '停用',
          onPress: GalleryMessage.PressedAction({ variant: 'disabled' }),
          variant: 'primary',
        }),
        Action(h, {
          busy: true,
          disabled: false,
          icon: null,
          label: '忙碌',
          onPress: GalleryMessage.PressedAction({ variant: 'busy' }),
          variant: 'primary',
        }),
      ]),
      section(
        h,
        '對話框',
        dialogueStates.map((state) =>
          Dialogue(h, {
            lines: [{ id: state, text: `狀態：${state}` }],
            more: state === 'shown',
            note: state === 'student' ? '應該要輸出 2 行，目前只輸出了 1 行。' : '',
            onPress: GalleryMessage.PressedDialogue(),
            state,
            who: '小精靈',
          }),
        ),
      ),
      section(h, '章節標籤', [Chapter(h, { name: '起步', number: '01' })]),
      section(h, '程式紙', [
        ...paperStates.map((state) =>
          Paper(h, {
            body: [h.pre.children(sample)],
            editMode: state === 'editing' ? 'insert' : null,
            hint: state === 'editing' ? '按 i 開始輸入' : '',
            mode: '-- NORMAL --',
            owner: 'student',
            state,
            title: state,
          }),
        ),
        Paper(h, {
          body: [
            h.div.class('screen').onMount(
              ShowCode({
                cursor: 0,
                flash: '',
                flashes: 0,
                hints: [],
                mode: 'normal',
                text: sample,
              }),
            ),
          ],
          editMode: 'normal',
          hint: '',
          mode: '-- NORMAL --',
          owner: 'sprite',
          state: 'editing',
          title: 'CodeMirror',
        }),
      ]),
      section(h, '輸入輸出格', [
        Cell(h, { kind: 'input', label: '輸入', state: 'value', status: '', text: '3 5' }),
        Cell(h, { kind: 'expect', label: '應該輸出', state: 'value', status: '', text: '5\n3\n' }),
        ...cellStates.map((state) =>
          Cell(h, {
            kind: 'output',
            label: '輸出',
            state,
            status: state,
            text: state === 'empty' ? '' : '11\n',
          }),
        ),
      ]),
      section(h, '片段卡', [Snippet(h, { text: 'cout << 11;' })]),
      section(
        h,
        '鍵盤圖與鍵帽',
        keyStates.map((state) => Keyboard(h, { mode: state, rows: capsOf(state) })),
      ),
      section(
        h,
        '通知',
        notices.map((kind) => Notice(h, { kind, text: kind })),
      ),
      section(
        h,
        '進度',
        progresses.map(({ percent, state }) =>
          Progress(h, { label: `${String(percent)}%`, percent, state }),
        ),
      ),
    ),
});

export { Gallery };
