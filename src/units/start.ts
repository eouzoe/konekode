interface Beat {
  readonly append?: boolean;
  readonly auto?: number;
  readonly expect?: string;
  readonly id: string;
  readonly input?: string;
  readonly lines?: string;
  readonly say: string;
  readonly snippet?: string;
  readonly stage: 'code' | 'drill' | 'empty' | 'run';
  readonly wait?: 'drill' | 'run';
}

const template = `#include <bits/stdc++.h>
using namespace std;

int main()
{
    cin.tie(nullptr)->sync_with_stdio(false);
}`;

const starter = `#include <bits/stdc++.h>
using namespace std;

int main()
{
    cin.tie(nullptr)->sync_with_stdio(false);

}`;

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
  {
    append: true,
    id: 'type-template',
    say: '所以，來輸入一遍，熟悉一下吧！',
    stage: 'drill',
    wait: 'drill',
  },
  { id: 'typed', say: '好，就是這樣。', stage: 'code' },
];

const editing: readonly Beat[] = [
  { id: 'do-things', say: '現在開始讓程式做事。', stage: 'run' },
  { id: 'editor', say: '上面這一塊，是我們寫程式的地方。', stage: 'run' },
  {
    id: 'vim-modes',
    say: '它有兩種模式。一種是用來打字的輸入模式，另一種是用來移動和下指令的一般模式。',
    stage: 'run',
  },
  {
    id: 'vim-normal',
    say: '它現在是一般模式，所以現在按鍵盤，字不會跑出來。',
    stage: 'run',
  },
  {
    id: 'vim-i',
    say: '按一下 i，左下角會出現 INSERT，這就是輸入模式，這時候才能打字。',
    stage: 'run',
  },
  {
    id: 'vim-esc',
    say: '打完之後，按一下鍵盤左上角的 Esc，就會回到一般模式。',
    stage: 'run',
  },
  {
    id: 'add-cout',
    say: '等一下，我們要在大括號裡面那一行空白，打上這一行。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'indent',
    say: '寫在大括號裡面的每一行，都要往右縮進去四格。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'indent-why',
    say: '這樣一眼就看得出來，哪幾行是屬於這個大括號的。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'tab',
    say: '我們不用自己按四次空白鍵。按一下鍵盤左邊的 Tab，就會一次空四格。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'semicolon',
    say: '最後面的分號，是在告訴電腦這一句講完了。少了它，電腦會看不懂。',
    snippet: print7,
    stage: 'run',
  },
  {
    id: 'what-run',
    say: '打好之後要按執行。執行的意思，是叫電腦照我們寫的程式做一遍。',
    snippet: print7,
    stage: 'run',
  },
  {
    expect: '7',
    id: 'run-cout',
    say: '請用滑鼠點一下那一行空白，按 i，按 Tab，打上這一行，再按 Esc，然後按執行。',
    snippet: print7,
    stage: 'run',
    wait: 'run',
  },
  { id: 'saw-7', say: '有看到 7 嗎？cout 的工作就是把東西印出來。', stage: 'run' },
  { id: 'arrows-out', say: '中間的 << 像兩個箭頭，把 7 送到 cout 那邊去。', stage: 'run' },
  {
    id: 'run-key',
    say: '以後不用每次都用滑鼠按執行。在一般模式按 Enter，也會執行。',
    stage: 'run',
  },
];

const printing: readonly Beat[] = [
  { id: 'add-8', say: '接下來，我們再多印一個 8。', stage: 'run' },
  {
    expect: '78',
    id: 'run-78',
    say: '請在下面再加一行，然後執行。',
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
    say: String.raw`換行要自己印出來，寫法是 '\n'。`,
    snippet: printLines,
    stage: 'run',
  },
  {
    expect: '7\n8',
    id: 'run-newline',
    say: '請把兩行都改成這樣，再執行一次。',
    snippet: printLines,
    stage: 'run',
    wait: 'run',
  },
  {
    id: 'each-line',
    say: String.raw`這次 7 和 8 各佔一行了。以後每印完一行，都要記得加上 '\n'。`,
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
    expect: '7',
    id: 'run-int',
    say: '請把剛才那兩行換成這兩行，再執行。',
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
    say: '上面多了一格「輸入」，裡面已經填好 42 了。請把程式改好，然後執行。',
    snippet: listen,
    stage: 'run',
    wait: 'run',
  },
  {
    id: 'echo',
    say: '我們輸入什麼，它就印出什麼。把輸入改成別的數字再執行一次，結果也會跟著變。',
    stage: 'run',
  },
];

const closing: readonly Beat[] = [
  { id: 'recap', say: String.raw`到這裡，cout、'\n'、int、cin 我們都用過了。`, stage: 'run' },
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
