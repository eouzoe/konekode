import { gsap } from 'gsap';

import { createDialogue } from './dialogue';
import { element } from './dom';
import { createDemo } from './home-demo';
import {
  fillRoute,
  fillText,
  shownLines,
  still,
  stopAt,
  targetOf,
  wire,
  type Line,
} from './home-visit';
import { createStage, loginScene } from './scene/stage';
import { waitForNext } from './turn';

const homeGap = 0.04;
const moods: Readonly<Record<string, string>> = {
  explain: '說明',
  greet: '打招呼',
  invite: '邀請',
  miss: '想念',
  point: '指給大家看',
  proud: '得意',
  reassure: '安撫',
};
const motion = {
  bar: { at: 0.6, autoAlpha: 0, duration: 0.9, translateY: -12 },
  demo: { autoAlpha: 1, duration: 1, ease: 'expo.out', rotate: -1.5, translateY: 0 },
  demoFrom: { autoAlpha: 0, rotate: 3, translateY: 60 },
  dialogue: { at: 1.3, autoAlpha: 0, duration: 0.8, translateY: 20 },
  menu: { autoAlpha: 0, duration: 0.4, stagger: 0.06, translateY: -8 },
  route: { duration: 0.5, ease: 'sine.inOut', repeat: 1, scale: 1.03, yoyo: true },
  side: { at: 1.1, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.15, translateX: 50 },
  sprite: { at: 0.8, autoAlpha: 0, duration: 1.2, ease: 'expo.out', scale: 0.85 },
  veilIn: { autoAlpha: 1, duration: 0.8, ease: 'power2.in' },
  veilOut: { autoAlpha: 0, duration: 1.8, ease: 'power2.inOut' },
};
const sceneLook = { flicker: true, focusY: 0.92, overscan: 1.5, scene: loginScene };
const entrances = [
  { target: '.bar', vars: motion.bar },
  { target: '#sprite', vars: motion.sprite },
  { target: ['#route', '#reads'], vars: motion.side },
  { target: '#dialogue', vars: motion.dialogue },
];

const lookName = (): string => {
  if (wire) {
    return 'wire';
  }
  return 'art';
};

document.body.dataset.look = lookName();

const veil = element('veil');
const demoBox = element('demo');
const menu = element('menu');
const menuButton = element('menu-button');
const dialogue = createDialogue(element('line'), element('more'), homeGap);
const demo = createDemo();

const show = (what: string | undefined): void => {
  if (what === 'route') {
    gsap.fromTo('#route', { scale: 1 }, motion.route);
  }
  if (what === 'demo' && demoBox.dataset.on !== 'true') {
    demoBox.dataset.on = 'true';
    gsap.fromTo(demoBox, motion.demoFrom, { ...motion.demo, onComplete: demo.measure });
    demo.play();
  }
};

const enter = async (go: string): Promise<void> => {
  await gsap.to(veil, motion.veilIn);
  location.href = targetOf(go);
};

const say = async (line: Line): Promise<void> => {
  element('mood').textContent = `表情：${moods[line.mood] ?? line.mood}`;
  const spoken = dialogue.say(fillText(line.say), { append: false, instant: still });
  show(line.show);
  await spoken;
};

const speakStill = async (at: number): Promise<void> => {
  const line = shownLines()[at];
  if (line === undefined) {
    return;
  }
  await say(line);
  if (at + 1 >= stopAt()) {
    dialogue.showMore(true);
    return;
  }
  await speakStill(at + 1);
};

const speak = async (at: number): Promise<void> => {
  const line = shownLines()[at];
  if (line === undefined) {
    return;
  }
  await say(line);
  dialogue.showMore();
  await waitForNext('a, button, .menu');
  if (line.go !== undefined) {
    await enter(line.go);
    return;
  }
  await speak(at + 1);
};

const intro = (): gsap.core.Timeline => {
  const timeline = gsap.timeline().to(veil, motion.veilOut);
  for (const { target, vars } of entrances) {
    const { at, ...from } = vars;
    timeline.from(target, from, at);
  }
  return timeline;
};

menuButton.addEventListener('click', () => {
  const open = menu.hidden === true;
  menu.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  if (open) {
    gsap.from(menu.children, motion.menu);
  }
});

for (const kind of ['keydown', 'pointerdown']) {
  document.addEventListener(kind, () => {
    dialogue.hurry();
  });
}

gsap.set([demoBox, '#more'], { autoAlpha: 0 });
if (!wire) {
  createStage(element('stage'), sceneLook);
}
fillRoute(element('steps'));
const opening = intro();
if (still) {
  opening.progress(1);
  await speakStill(0);
} else {
  await opening;
  await speak(0);
}
