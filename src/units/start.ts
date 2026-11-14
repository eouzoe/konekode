interface Beat {
  readonly after?: 'next';
  readonly append?: boolean;
  readonly demo?: string;
  readonly auto?: number;
  readonly expect?: string;
  readonly id: string;
  readonly input?: string;
  readonly keys?: readonly string[];
  readonly lines?: string;
  readonly say: string;
  readonly snippet?: string;
  readonly stage: 'code' | 'drill' | 'empty' | 'run';
  readonly wait?: 'drill' | 'run';
  readonly when?: 'fullscreen' | 'windowed';
}

const template = `#include <bits/stdc++.h>
using namespace std;

int main()
{
    cin.tie(nullptr)->sync_with_stdio(false);
}`;

const starter = template;

const newline = String.raw`'\n'`;
const print7 = 'cout << 7;';
const print78 = 'cout << 7;\ncout << 8;';
const printLines = String.raw`cout << 7 << '\n';
cout << 8 << '\n';`;
const remember = String.raw`int a{7};
cout << a << '\n';`;
const listen = String.raw`int a{};
cin >> a;
cout << a << '\n';`;
const task = '輸入有兩個整數。請先印出第二個數，換行；再印出第一個數，換行。';

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
  { demo: 'reset demo', id: 'demo-intro', say: '開始之前，先看一遍示範吧！', stage: 'drill' },
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
    demo: 'key:a key:b key:c',
    id: 'normal-readonly',
    say: '在這個模式下，內容是唯讀的，所以按鍵盤打不出字。',
    stage: 'drill',
  },
  {
    demo: 'wait wait down:i key:i up:i',
    id: 'press-i',
    say: '要輸入文字的話，需要按 i 切換成輸入模式。',
    stage: 'drill',
  },
  { id: 'insert-is', say: '這就是輸入模式，現在可以打字了！', stage: 'drill' },
  {
    id: 'shift-combo',
    say: '有些符號要先按住 Shift，使用組合鍵來輸入，像是這個 # 就是 Shift + 3。',
    stage: 'drill',
  },
  {
    after: 'next',
    demo: 'down:Shift wait down:3 key:# up:3 wait up:Shift wait fill wait',
    id: 'speed-run',
    say: '剩下的，就讓我們一口氣打完吧！',
    stage: 'drill',
  },
  {
    demo: 'wait down:Escape esc up:Escape',
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

const editing: readonly Beat[] = [
  { id: 'do-things', say: '接下來，讓程式開始做事吧！', stage: 'run' },
  { id: 'editor', say: '這裡是我們寫程式的地方，用法和剛才一樣喔！', stage: 'run' },
  {
    id: 'add-cout',
    say: '等一下，我們要把這一行加進大括號裡面。',
    snippet: print7,
    stage: 'run',
  },
  { id: 'watch-edit', keys: ['reset'], say: '一樣先看一次示範吧！', snippet: print7, stage: 'run' },
  {
    id: 'move-jk',
    keys: ['j', 'j', 'j', 'k', 'j', 'j', 'j'],
    say: '在一般模式下，按 j 會往下一行，按 k 會往上一行。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'open-line',
    keys: ['o'],
    say: '到了要加東西的地方，按 o，下面就會多出新的一行，而且直接變成輸入模式。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'indent',
    keys: [],
    say: '新的一行會自動往右縮四格。寫在大括號裡面的每一行都要這樣，一眼就看得出它們屬於這個大括號。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'semicolon',
    keys: ['type:cout << 7;'],
    say: '然後打上這一行。最後面的分號，是在告訴電腦這一句講完了。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'what-run',
    keys: ['Esc', 'run'],
    say: '打完之後按 Esc 回到一般模式，再按 Enter，電腦就會照我們寫的程式做一遍。',
    snippet: print7,
    stage: 'run',
  },
  {
    expect: '7',
    id: 'run-cout',
    say: '換我們了！把這一行加進去，然後按 Enter 執行吧！',
    snippet: print7,
    stage: 'run',
    wait: 'run',
  },
  { id: 'saw-7', say: '有看到 7 嗎？cout 的工作就是把東西印出來。', stage: 'run' },
  { id: 'arrows-out', say: '中間的 << 像兩個箭頭，把 7 送到 cout 那邊去。', stage: 'run' },
];

const printing: readonly Beat[] = [
  { id: 'add-8', say: '接下來，我們再多印一個 8。', stage: 'run' },
  {
    expect: '78',
    id: 'run-78',
    say: '移到 cout 那一行，按 o 在下面再加一行，然後執行吧！',
    snippet: print78,
    stage: 'run',
    wait: 'run',
  },
  { id: 'stuck-together', say: '結果變成 78 了，兩個數字黏在一起。', stage: 'run' },
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
  {
    id: 'append-line',
    keys: ['reset', 'find:cout << 7', 'A'],
    say: '要改已經寫好的一行，先移到那一行，按 A，就會跳到這一行的最後面開始打字。',
    snippet: printLines,
    stage: 'run',
  },
  {
    id: 'backspace',
    keys: ['BS', `type: << ${newline};`, 'Esc'],
    say: `按 Backspace 把分號刪掉，接著打上 << ${newline}，最後把分號補回來。`,
    snippet: printLines,
    stage: 'run',
  },
  {
    expect: '7\n8',
    id: 'run-newline',
    say: '換我們了！把兩行都改成這樣，再執行一次吧！',
    snippet: printLines,
    stage: 'run',
    wait: 'run',
  },
  {
    id: 'each-line',
    say: `這次 7 和 8 各佔一行了。以後每印完一行，都要記得加上 ${newline}。`,
    stage: 'run',
  },
];

const storing: readonly Beat[] = [
  { id: 'remember-number', say: '現在來讓程式記住一個數字。', stage: 'run' },
  {
    id: 'int-explained',
    say: 'int 是整數的意思，a 是我們幫它取的名字，大括號裡面放的是它一開始的值。',
    snippet: remember,
    stage: 'run',
  },
  {
    id: 'delete-line',
    keys: ['reset', 'find:cout << 7', 'dd', 'dd'],
    say: '不要的那一行，移過去之後連按兩次 d，就會整行刪掉。',
    snippet: remember,
    stage: 'run',
  },
  {
    id: 'retype',
    keys: ['k', 'o', 'type:int a{7};', 'Enter', `type:cout << a << ${newline};`, 'Esc'],
    say: '接著按 k 回到上一行，按 o 把新的兩行打上去。在輸入模式按 Enter，可以換到下一行繼續打。',
    snippet: remember,
    stage: 'run',
  },
  {
    expect: '7',
    id: 'run-int',
    say: '換我們了！把剛才那兩行換成這兩行，再執行吧！',
    snippet: remember,
    stage: 'run',
    wait: 'run',
  },
  { id: 'from-a', say: '印出來的還是 7，不過這次的 7 是從 a 裡面拿出來的。', stage: 'run' },
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
  {
    expect: '42',
    id: 'run-cin',
    input: '42',
    say: '編輯器下面多了一格「輸入」，裡面已經填好 42 了。請把程式改好，然後執行。',
    snippet: listen,
    stage: 'run',
    wait: 'run',
  },
  {
    id: 'echo',
    say: '我們輸入什麼，它就印出什麼。',
    stage: 'run',
  },
];

const closing: readonly Beat[] = [
  { id: 'recap', say: `到這裡，cout、${newline}、int、cin 我們都用過了。`, stage: 'run' },
  { id: 'your-turn', say: '最後一題，我們不看範例，自己寫寫看。', stage: 'run' },
  {
    id: 'two-vars',
    say: '兩個數就需要兩個變數。第二個變數可以叫 b，寫法和 a 一樣。',
    snippet: task,
    stage: 'run',
  },
  {
    expect: '5\n3',
    id: 'task',
    input: '3 5',
    say: '請照上面的題目寫出程式，然後執行。',
    snippet: task,
    stage: 'run',
    wait: 'run',
  },
  { id: 'done', say: '做到了。我們已經會讓程式讀東西、記東西、印東西了。', stage: 'run' },
];

const beats: readonly Beat[] = [...opening, ...editing, ...printing, ...storing, ...closing];

export { beats, starter, template };
