import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';

import { sentenceOf } from './dom';

gsap.registerPlugin(SplitText);

interface Dialogue {
  readonly hideMore: () => void;
  readonly hurry: () => void;
  readonly say: (text: string, options: SayOptions) => Promise<void>;
  readonly showMore: (instant?: boolean) => void;
}

interface SayOptions {
  readonly append: boolean;
  readonly instant: boolean;
}

const reveal = {
  autoAlpha: 0,
  duration: 0.45,
  ease: 'power2.out',
  filter: 'blur(5px)',
  translateY: 5,
};
const unitGap = 0.035;
const fadeMore = { hidden: 0.15, shown: 0.4 };

const createDialogue = (line: HTMLElement, more: HTMLElement, letterGap = unitGap): Dialogue => {
  let split: SplitText | null = null;
  let running: gsap.core.Tween | null = null;
  const place = (text: string, append: boolean): HTMLElement => {
    const sentence = sentenceOf(text);
    if (append) {
      line.append(document.createElement('br'), sentence);
    } else {
      line.replaceChildren(sentence);
    }
    return sentence;
  };
  const say = async (text: string, { append, instant }: SayOptions): Promise<void> => {
    gsap.to(more, { autoAlpha: 0, duration: fadeMore.hidden });
    split?.revert();
    const sentence = place(text, append);
    if (instant) {
      return;
    }
    split = SplitText.create(sentence, { type: 'chars' });
    running = gsap.from(split.chars, { ...reveal, stagger: { each: letterGap } });
    await running;
    running = null;
  };
  return {
    hideMore: () => {
      gsap.to(more, { autoAlpha: 0, duration: fadeMore.hidden });
    },
    hurry: () => {
      running?.progress(1);
    },
    say,
    showMore: (instant = false) => {
      gsap.to(more, { autoAlpha: 1, duration: fadeMore.shown * Number(!instant) });
    },
  };
};

export { createDialogue, type Dialogue, type SayOptions };
