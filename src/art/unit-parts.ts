import { createDialogue } from './dialogue';
import { element } from './dom';
import { createDrillFlow } from './drill-flow';
import { createKeyboard } from './keyboard';
import { createPaper } from './paper';
import { createRunFlow } from './run-flow';
import { createStage } from './scene/stage';

const sheet = element('sheet');
const modeLine = element('mode');
const keyboard = createKeyboard(element('keyboard'));
const paper = createPaper({
  editor: element('editor'),
  keycap: element('keycap'),
  modeLine,
  sheet,
});
const stage = createStage(element('stage'));

const parts = {
  dialogue: createDialogue(element('line'), element('more')),
  dialogueBox: element('dialogue'),
  drill: createDrillFlow({ keyboard, modeLine, paper }),
  hint: element('hint'),
  keyboard,
  paper,
  run: createRunFlow({ paper, stage }),
  sheet,
  stage,
  ui: element('ui'),
};

export { parts };
