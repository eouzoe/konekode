import { flatten, tasksOf, type Beat, type Part, type Task } from '@/lib/unit/format';

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

const opening: readonly Beat[] = [
  { id: 'fullscreen-ask', say: '開始之前，建議先按 F11，把畫面放到全螢幕喔！', stage: 'empty' },
  {
    id: 'fullscreen-yes',
    say: '哇，已經是全螢幕了！真棒！',
    stage: 'empty',
    when: 'fullscreen',
  },
  {
    id: 'fullscreen-no',
    say: '好吧，那我們就這樣開始吧。',
    stage: 'empty',
    when: 'windowed',
  },
  { id: 'intro', say: '好的，那就讓我們從第一步開始吧！', stage: 'empty' },
  { append: true, id: 'see-template', say: '看看這些東東。', stage: 'code' },
  { id: 'line-include', lines: '1', say: '一行 include 萬能標頭檔。', stage: 'code' },
  { id: 'line-using', lines: '2', say: '一行用來讓我們少打 std:: 的東東。', stage: 'code' },
  { auto: 3000, id: 'line-main', lines: '4', say: '然後是我們的主函式。', stage: 'code' },
  {
    append: true,
    id: 'line-braces',
    lines: '5,6,7',
    say: '未來大部分東西都會放在 {} 這裡面。',
    stage: 'code',
  },
  { id: 'line-fastio', lines: '6', say: '還有輸入輸出加速。', stage: 'code' },
  { id: 'lost', say: '完全聽不懂嗎？', stage: 'code' },
  {
    append: true,
    id: 'never-mind',
    say: '沒關係！聽不懂才是正常的！完全不用擔心！',
    stage: 'code',
  },
  { id: 'every-program', say: '接下來它們會不斷地以這個樣子出現，', stage: 'code' },
  { append: true, id: 'lets-type', say: '所以，來輸入一遍，熟悉一下吧！', stage: 'code' },
  {
    demo: 'reset demo',
    id: 'demo-intro',
    say: '開始之前，先看一遍示範吧！',
    stage: 'drill',
  },
  {
    id: 'vim-what',
    say: 'vim 是一種只靠鍵盤就能寫程式的方式，也是一種哲學。',
    stage: 'drill',
  },
  {
    append: true,
    demo: 'flash show:insert wait wait show:normal',
    id: 'vim-two-modes',
    say: 'vim 有兩種模式：normal 與 insert。',
    stage: 'drill',
  },
  { id: 'normal-is', say: 'normal 是一般模式，用來看程式和下指令。', stage: 'drill' },
  {
    append: true,
    demo: 'down:a key:a up:a down:b key:b up:b down:c key:c up:c',
    id: 'normal-readonly',
    say: '在這個模式下，內容是唯讀的，所以按鍵盤打不出字。',
    stage: 'drill',
  },
  {
    demo: 'hint',
    id: 'press-i',
    say: '要輸入文字的話，需要按 i 切換成輸入模式。',
    stage: 'drill',
    unlock: ['key.i'],
  },
  {
    demo: 'hush down:i key:i up:i',
    id: 'insert-is',
    say: '這就是輸入模式，現在可以打字了！',
    stage: 'drill',
  },
  {
    demo: 'hint',
    id: 'shift-combo',
    say: '有些符號要先按住 Shift，使用組合鍵來輸入，像是這個 # 就是 Shift + 3。',
    stage: 'drill',
  },
  {
    after: 'next',
    demo: 'down:Shift wait down:3 hush key:# up:3 wait up:Shift wait fill wait',
    id: 'speed-run',
    say: '剩下的，就讓我們一口氣打完吧！',
    stage: 'drill',
  },
  {
    demo: 'hint wait down:Escape esc up:Escape',
    id: 'press-esc',
    say: '打完之後，按左上角的 Esc，就會回到一般模式。',
    stage: 'drill',
  },
  {
    demo: 'live',
    id: 'type-template',
    say: '就是這樣！換我們自己來試試看吧！',
    stage: 'drill',
    wait: 'drill',
  },
];

const addCout: Task = {
  ask: '換我們了！把這一行加進去，然後按 Enter 執行吧！',
  demo: [
    { id: 'watch-edit', keys: [], say: '一樣先看一次示範吧！' },
    {
      id: 'go-end',
      keys: ['G'],
      say: '在一般模式按大寫的 G，游標會跳到最後一行。',
      teaches: ['key.G'],
    },
    {
      id: 'open-above',
      keys: ['O'],
      say: '再按大寫的 O，上面就會多出新的一行，而且直接變成輸入模式。',
      teaches: ['key.O'],
    },
    {
      id: 'indent',
      keys: [],
      say: '新的一行會自動往右縮四格。寫在大括號裡面的每一行都要這樣，一眼就看得出它們屬於這個大括號。',
    },
    {
      id: 'semicolon',
      keys: ['type:cout << 11;'],
      say: '然後打上這一行。最後面的分號，是在告訴電腦這一句講完了。',
    },
    {
      id: 'what-run',
      keys: ['Esc', 'run'],
      say: '打完之後按 Esc 回到一般模式，再按 Enter，電腦就會照我們寫的程式做一遍。',
    },
  ],
  expect: '11',
  goal: printOne,
  id: 'run-cout',
  show: printOne,
};

const addSecond: Task = {
  ask: '換我們了！加上這一行，然後執行吧！',
  demo: [
    {
      id: 'open-below',
      keys: ['o'],
      say: '游標還停在剛才那一行。按小寫的 o，下面就會多出新的一行。大寫是往上開，小寫是往下開。',
      teaches: ['key.o'],
    },
    {
      id: 'type-second',
      keys: ['type:cout << 22;', 'Esc'],
      say: '打上這一行，再按 Esc 回到一般模式。',
    },
  ],
  expect: '1122',
  goal: printTwo,
  id: 'run-two',
  show: printTwo,
};

const addNewlines: Task = {
  ask: '換我們了！把兩行都改成這樣，再執行一次吧！',
  demo: [
    {
      id: 'line-end',
      keys: ['$'],
      say: '要在分號的前面加東西。按 $，游標會跳到這一行的最後面，也就是分號上。',
      teaches: ['key.$'],
    },
    {
      id: 'insert-before',
      keys: ['i', `type: << ${newline}`, 'Esc'],
      say: '按 i 會從游標的前面開始打字，所以打出來的東西剛好在分號前面。',
    },
    {
      id: 'repeat',
      keys: ['k', '$', '.'],
      say: '上面那一行也要改。按 k 往上一行，按 $ 到最後面，再按 . ，就會把剛才做的事再做一次。',
      teaches: ['key.k', 'key..'],
    },
  ],
  expect: '11\n22',
  goal: printLines,
  id: 'run-newline',
  show: printLines,
};

const useVariable: Task = {
  ask: '換我們了！把原本的兩行換成這兩行，再執行吧！',
  demo: [
    {
      id: 'delete-lines',
      keys: ['dj'],
      say: '原本的兩行不要了。按 d 再按 j，會把游標這一行和下面那一行一起刪掉。',
      teaches: ['key.d', 'key.j'],
    },
    {
      id: 'retype',
      keys: ['O', 'type:int a{11};', 'Enter', `type:cout << a << ${newline};`, 'Esc'],
      say: '再按大寫的 O 開新的一行，把這兩行打上去。在輸入模式按 Enter，可以換到下一行繼續打。',
    },
  ],
  expect: '11',
  goal: remember,
  id: 'run-int',
  show: remember,
};

const readInput: Task = {
  ask: '編輯器下面多了一格「輸入」，裡面已經填好 42 了。換我們了！把程式改好，然後執行吧！',
  demo: [
    {
      id: 'find-char',
      keys: ['k', '0', 'f1'],
      say: '先把 11 拿掉。按 k 回到上一行，按 0 回到這一行的最前面，再按 f 和 1，游標會往右找到第一個 1。',
      teaches: ['key.0', 'key.f'],
    },
    {
      id: 'delete-char',
      keys: ['x', 'x'],
      say: '按 x 會刪掉游標上的那個字。按兩次，11 就不見了。',
      teaches: ['key.x'],
    },
    {
      id: 'add-cin',
      keys: ['o', 'type:cin >> a;', 'Esc'],
      say: '然後按小寫的 o 往下開一行，把 cin 那一行打上去。',
    },
  ],
  expect: '42',
  goal: listen,
  id: 'run-cin',
  input: '42',
  show: listen,
};

const swapTwo: Task = {
  ask: '請照上面的題目寫出程式，然後執行。',
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
    say: '接下來，讓程式開始做事吧！',
    stage: 'run',
    unlock: ['pair.include-angle', 'pair.paren', 'pair.brace'],
  },
  { id: 'editor', say: '這裡是我們寫程式的地方，用法和剛才一樣喔！', stage: 'run' },
  {
    id: 'add-cout',
    say: '等一下，我們要把這一行加進大括號裡面。',
    snippet: printOne,
    stage: 'run',
  },
  { task: addCout },
  { id: 'saw-output', say: '有看到 11 嗎？cout 的工作就是把東西印出來。', stage: 'run' },
  { id: 'arrows-out', say: '中間的 << 像兩個箭頭，把 11 送到 cout 那邊去。', stage: 'run' },
];

const printing: readonly Part[] = [
  { id: 'add-second', say: '接下來，我們再多印一個 22。', snippet: printTwo, stage: 'run' },
  { task: addSecond },
  { id: 'stuck-together', say: '結果變成 1122 了，兩個數字黏在一起。', stage: 'run' },
  {
    id: 'honest',
    say: '這是因為電腦很老實。我們沒有叫它換行，它就不會換行。',
    stage: 'run',
  },
  {
    id: 'newline',
    say: `換行要自己印出來，寫法是 ${newline}。`,
    snippet: printLines,
    stage: 'run',
  },
  { task: addNewlines },
  {
    id: 'each-line',
    say: `這次 11 和 22 各佔一行了。以後每印完一行，都要記得加上 ${newline}。`,
    stage: 'run',
  },
];

const storing: readonly Part[] = [
  { id: 'remember-number', say: '現在來讓程式記住一個數字。', stage: 'run' },
  {
    id: 'int-explained',
    say: 'int 是整數的意思，a 是我們幫它取的名字，大括號裡面放的是它一開始的值。',
    snippet: remember,
    stage: 'run',
  },
  { task: useVariable },
  { id: 'from-a', say: '印出來的還是 11，不過這次的 11 是從 a 裡面拿出來的。', stage: 'run' },
  { id: 'variable', say: '像 a 這樣可以放東西的名字，叫做變數。', stage: 'run' },
  { id: 'listen', say: '最後一樣東西，是讓程式聽我們說話。', stage: 'run' },
  {
    id: 'cin-explained',
    say: 'cin 會把我們輸入的數字，放進我們指定的變數裡。',
    snippet: listen,
    stage: 'run',
  },
  {
    id: 'arrows-in',
    say: '這次箭頭的方向反過來了，是從 cin 送進 a。',
    snippet: listen,
    stage: 'run',
  },
  {
    id: 'empty-braces',
    say: '這次大括號裡面是空的，因為 a 的值等一下會由我們輸入。',
    snippet: listen,
    stage: 'run',
  },
  { task: readInput },
  { id: 'echo', say: '我們輸入什麼，它就印出什麼。', stage: 'run' },
];

const closing: readonly Part[] = [
  { id: 'recap', say: `到這裡，cout、${newline}、int、cin 我們都用過了。`, stage: 'run' },
  { id: 'your-turn', say: '最後一題，我們不看範例，自己寫寫看。', stage: 'run' },
  {
    id: 'two-vars',
    say: '兩個數就需要兩個變數。第二個變數可以叫 b，寫法和 a 一樣。',
    snippet: task,
    stage: 'run',
  },
  { task: swapTwo },
  { id: 'done', say: '做到了。我們已經會讓程式讀東西、記東西、印東西了。', stage: 'run' },
];

const parts: readonly Part[] = [...opening, ...editing, ...printing, ...storing, ...closing];

const beats: readonly Beat[] = flatten(parts);

const tasks: readonly Task[] = tasksOf(parts);

export { beats, starter, tasks, template };
