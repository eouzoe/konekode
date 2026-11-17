import { flatten, tasksOf, type Beat, type Line, type Part, type Task } from '@/lib/unit/format';

import text from './text/zh-TW/start.json' with { type: 'json' };

const template = `#include <bits/stdc++.h>
using namespace std;

int main()
{
    cin.tie(nullptr)->sync_with_stdio(false);
}`;

const starter = template;

const newline = String.raw`'\n'`;
const printOne = 'cout << 11;';
const printTwo = 'cout << 11;\ncout << 22;';
const printLines = String.raw`cout << 11 << '\n';
cout << 22 << '\n';`;
const remember = String.raw`int a{11};
cout << a << '\n';`;
const listen = String.raw`int a{};
cin >> a;
cout << a << '\n';`;
const task = '輸入有兩個整數。請先印出第二個數，換行；再印出第一個數，換行。';
const swapped = String.raw`int a{};
int b{};
cin >> a >> b;
cout << b << '\n';
cout << a << '\n';`;

const opening: readonly Line[] = [
  { id: 'fullscreen-ask', stage: 'empty' },
  {
    id: 'fullscreen-yes',
    stage: 'empty',
    when: 'fullscreen',
  },
  {
    id: 'fullscreen-no',
    stage: 'empty',
    when: 'windowed',
  },
  { id: 'intro', stage: 'empty' },
  { append: true, id: 'see-template', stage: 'code' },
  { id: 'line-include', lines: '1', stage: 'code' },
  { id: 'line-using', lines: '2', stage: 'code' },
  { auto: 3000, id: 'line-main', lines: '4', stage: 'code' },
  {
    append: true,
    id: 'line-braces',
    lines: '5,6,7',
    stage: 'code',
  },
  { id: 'line-fastio', lines: '6', stage: 'code' },
  { id: 'lost', stage: 'code' },
  {
    append: true,
    id: 'never-mind',
    stage: 'code',
  },
  { id: 'every-program', stage: 'code' },
  { append: true, id: 'lets-type', stage: 'code' },
  {
    demo: 'reset demo',
    id: 'demo-intro',
    stage: 'drill',
  },
  {
    id: 'vim-what',
    stage: 'drill',
  },
  {
    append: true,
    demo: 'flash show:insert wait wait show:normal',
    id: 'vim-two-modes',
    stage: 'drill',
  },
  { id: 'normal-is', stage: 'drill' },
  {
    append: true,
    demo: 'down:a key:a up:a down:b key:b up:b down:c key:c up:c',
    id: 'normal-readonly',
    stage: 'drill',
  },
  {
    demo: 'hint',
    id: 'press-i',
    stage: 'drill',
    unlock: ['key.i'],
  },
  {
    demo: 'hush down:i key:i up:i',
    id: 'insert-is',
    stage: 'drill',
  },
  {
    demo: 'hint',
    id: 'shift-combo',
    stage: 'drill',
  },
  {
    after: 'next',
    demo: 'down:Shift wait down:3 hush key:# up:3 wait up:Shift wait fill wait',
    id: 'speed-run',
    stage: 'drill',
  },
  {
    demo: 'hint wait down:Escape esc up:Escape',
    id: 'press-esc',
    stage: 'drill',
  },
  {
    demo: 'live',
    id: 'type-template',
    stage: 'drill',
    wait: 'drill',
  },
];

const addCout: Task = {
  demo: [
    { id: 'watch-edit', keys: [] },
    { id: 'where-it-goes', keys: [] },
    {
      id: 'go-end',
      keys: ['G'],
      teaches: ['key.G'],
    },
    {
      id: 'open-above',
      keys: ['O'],
      teaches: ['key.O'],
    },
    {
      id: 'indent',
      keys: [],
    },
    {
      id: 'semicolon',
      keys: ['type:cout << 11;'],
    },
    {
      id: 'what-run',
      keys: ['Esc', 'run'],
    },
  ],
  expect: '11',
  goal: printOne,
  id: 'run-cout',
  show: printOne,
};

const addSecond: Task = {
  demo: [
    {
      id: 'open-below',
      keys: ['o'],
      teaches: ['key.o'],
    },
    {
      id: 'type-second',
      keys: ['type:cout << 22;', 'Esc'],
    },
  ],
  expect: '1122',
  goal: printTwo,
  id: 'run-two',
  show: printTwo,
};

const addNewlines: Task = {
  demo: [
    {
      id: 'line-end',
      keys: ['$'],
      teaches: ['key.$'],
    },
    {
      id: 'insert-before',
      keys: ['i', `type: << ${newline}`, 'Esc'],
    },
    { id: 'repeat-ask', keys: [] },
    {
      id: 'repeat',
      keys: ['k', '$', '.'],
      teaches: ['key.k', 'key..'],
    },
    { id: 'repeat-point', keys: [] },
  ],
  expect: '11\n22',
  goal: printLines,
  id: 'run-newline',
  show: printLines,
};

const useVariable: Task = {
  demo: [
    {
      id: 'delete-lines',
      keys: ['dj'],
      teaches: ['key.d', 'key.j'],
    },
    {
      id: 'retype',
      keys: ['O', 'type:int a{11};', 'Enter', `type:cout << a << ${newline};`, 'Esc'],
    },
  ],
  expect: '11',
  goal: remember,
  id: 'run-int',
  show: remember,
};

const readInput: Task = {
  demo: [
    {
      id: 'find-char',
      keys: ['k', '0', 'f1'],
      teaches: ['key.0', 'key.f'],
    },
    {
      id: 'delete-char',
      keys: ['x', 'x'],
      teaches: ['key.x'],
    },
    {
      id: 'add-cin',
      keys: ['o', 'type:cin >> a;', 'Esc'],
    },
  ],
  expect: '42',
  goal: listen,
  id: 'run-cin',
  input: '42',
  show: listen,
};

const swapTwo: Task = {
  demo: [],
  expect: '5\n3',
  goal: swapped,
  id: 'task',
  input: '3 5',
  show: task,
};

const editing: readonly Part[] = [
  {
    id: 'do-things',
    stage: 'run',
    unlock: ['pair.include-angle', 'pair.paren', 'pair.brace'],
  },
  { id: 'editor', stage: 'run' },
  {
    id: 'add-cout',
    snippet: printOne,
    stage: 'run',
  },
  { task: addCout },
  { id: 'saw-output', stage: 'run' },
  { id: 'arrows-out', stage: 'run' },
];

const printing: readonly Part[] = [
  { id: 'add-second', snippet: printTwo, stage: 'run' },
  { task: addSecond },
  { id: 'stuck-together', stage: 'run' },
  {
    id: 'honest',
    stage: 'run',
  },
  {
    id: 'newline',
    snippet: printLines,
    stage: 'run',
  },
  { task: addNewlines },
  {
    id: 'each-line',
    stage: 'run',
  },
];

const storing: readonly Part[] = [
  { id: 'remember-number', stage: 'run' },
  {
    id: 'int-explained',
    snippet: remember,
    stage: 'run',
  },
  { task: useVariable },
  { id: 'from-a', stage: 'run' },
  { id: 'variable', stage: 'run' },
  { id: 'listen', stage: 'run' },
  {
    id: 'cin-explained',
    snippet: listen,
    stage: 'run',
  },
  {
    id: 'arrows-in',
    snippet: listen,
    stage: 'run',
  },
  {
    id: 'empty-braces',
    snippet: listen,
    stage: 'run',
  },
  { task: readInput },
  { id: 'echo', stage: 'run' },
];

const closing: readonly Part[] = [
  { id: 'recap', stage: 'run' },
  { id: 'your-turn', stage: 'run' },
  {
    id: 'two-vars',
    snippet: task,
    stage: 'run',
  },
  { task: swapTwo },
  { id: 'done', stage: 'run' },
];

const parts: readonly Part[] = [...opening, ...editing, ...printing, ...storing, ...closing];

const beats: readonly Beat[] = flatten(parts, text);

const tasks: readonly Task[] = tasksOf(parts);

export { beats, starter, tasks, template };
