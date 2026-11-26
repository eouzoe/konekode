import { blink, body, runsOf, size, talk, type Layer, type Run } from './cat';

interface Look {
  readonly id: string;
  readonly label: string;
}

const looks: ReadonlyArray<Look> = [
  { id: '', label: '外觀：現在' },
  { id: 'sprite', label: '外觀：甲（像素小精靈）' },
  { id: 'pixel', label: '外觀：乙（整頁像素）' },
];

const storageKey = 'cp:dev:look';
const fontUrl = '/fonts/cubic-11/Cubic_11.woff2';
const namespace = 'http://www.w3.org/2000/svg';

const styles = `
@font-face { font-family: 'Cubic 11'; src: url('${fontUrl}') format('woff2'); font-display: swap; }
.dev-sprite { display: none; position: absolute; left: 2rem; bottom: calc(100% - 0.25rem);
  width: 6rem; height: 6rem; pointer-events: none; }
html[data-look] .dev-sprite { display: block; }
.dev-sprite svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.dev-sprite .blink { opacity: 0; animation: dev-blink 4.6s steps(1) infinite; }
.dev-sprite .talk { opacity: 0; }
html[data-look] .scene[data-revealing='true'] .dev-sprite .talk { animation: dev-talk 0.24s steps(1) infinite; }
@keyframes dev-blink { 0%, 96% { opacity: 0; } 97%, 100% { opacity: 1; } }
@keyframes dev-talk { 0% { opacity: 1; } 50%, 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .dev-sprite .blink, html[data-look] .scene[data-revealing='true'] .dev-sprite .talk { animation: none; }
}
html[data-look='pixel'] .scene .dialogue { border: 2px solid var(--ink); border-radius: 0;
  box-shadow: 0.25rem 0.25rem 0 var(--line); font-family: 'Cubic 11', var(--sans); font-size: 1.375rem;
  -webkit-font-smoothing: none; }
html[data-look='pixel'] .scene .dialogue .who { border-radius: 0; font-family: 'Cubic 11', var(--sans);
  font-size: 1.375rem; line-height: 1.3; padding: 0 0.5rem; }
html[data-look='pixel'] .scene .dialogue button,
html[data-look='pixel'] .scene .dialogue .more,
html[data-look='pixel'] .scene .dialogue .note { font-family: 'Cubic 11', var(--sans); font-size: 1.375rem;
  line-height: 1.4; }
html[data-look='pixel'] .scene .dialogue .note { font-size: 1.375rem; }
html[data-look='pixel'] .scene [data-code-runner] [data-role='hint'],
html[data-look='pixel'] .scene [data-code-runner] [data-role='status'],
html[data-look='pixel'] .scene [data-code-runner] [data-role='run'] { font-family: 'Cubic 11', var(--sans);
  font-size: 1.375rem; -webkit-font-smoothing: none; }
html[data-look='pixel'] .scene [data-code-runner] [data-role='run'],
html[data-look='pixel'] .scene [data-code-runner] [data-role='output'],
html[data-look='pixel'] .scene [data-code-runner] .cm-editor,
html[data-look='pixel'] .scene .snippet,
html[data-look='pixel'] .scene .code { border-radius: 0; }
`;

const drawRun = (run: Run): SVGRectElement => {
  const rect = document.createElementNS(namespace, 'rect');
  rect.setAttribute('x', String(run.column));
  rect.setAttribute('y', String(run.line));
  rect.setAttribute('width', String(run.width));
  rect.setAttribute('height', '1');
  rect.setAttribute('fill', run.fill);
  return rect;
};

const drawLayer = (layer: Layer, name: string): SVGSVGElement => {
  const svg = document.createElementNS(namespace, 'svg');
  svg.setAttribute('viewBox', `0 0 ${String(size)} ${String(size)}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('class', name);
  svg.append(...runsOf(layer).map((run) => drawRun(run)));
  return svg;
};

const buildSprite = (): HTMLElement => {
  const sprite = document.createElement('span');
  sprite.className = 'dev-sprite';
  sprite.setAttribute('aria-hidden', 'true');
  sprite.append(drawLayer(body, 'body'), drawLayer(blink, 'blink'), drawLayer(talk, 'talk'));
  return sprite;
};

const readLook = (): string => {
  try {
    return localStorage.getItem(storageKey) ?? '';
  } catch {
    return '';
  }
};

const writeLook = (id: string): boolean => {
  try {
    localStorage.setItem(storageKey, id);
    return true;
  } catch {
    return false;
  }
};

const applyLook = (id: string): Look => {
  const look = looks.find((item) => item.id === id) ?? looks[0] ?? { id: '', label: '' };
  if (look.id === '') {
    delete document.documentElement.dataset.look;
  } else {
    document.documentElement.dataset.look = look.id;
  }
  return look;
};

const nextLook = (id: string): Look => {
  const at = looks.findIndex((item) => item.id === id);
  return looks[(at + 1) % looks.length] ?? { id: '', label: '' };
};

const lookButton = (): HTMLButtonElement => {
  const button = document.createElement('button');
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);
  document.querySelector('[data-role="dialogue"]')?.prepend(buildSprite());
  button.textContent = applyLook(readLook()).label;
  button.addEventListener('click', () => {
    const look = nextLook(document.documentElement.dataset.look ?? '');
    writeLook(look.id);
    button.textContent = applyLook(look.id).label;
    button.blur();
  });
  return button;
};

export { lookButton };
