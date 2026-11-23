import { listenButtons } from '@/lib/scene/input';
import { readIntent, wouldLeave } from '@/lib/scene/keys';

interface Moves {
  readonly back: () => void;
  readonly next: () => void;
  readonly restart: () => void;
  readonly taking: () => boolean;
}

const onKey = (moves: Moves, event: KeyboardEvent): void => {
  if (wouldLeave(event)) {
    event.preventDefault();
  }
  const intent = readIntent(event);
  if (moves.taking() || intent === 'none') {
    return;
  }
  event.preventDefault();
  if (intent === 'backward') {
    moves.back();
    return;
  }
  moves.next();
};

const listenMoves = (root: HTMLElement, moves: Moves): void => {
  document.addEventListener('keydown', (event) => {
    onKey(moves, event);
  });
  listenButtons(root, moves);
};

export { listenMoves, type Moves };
