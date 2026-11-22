import { type Rule } from './plan';

const kibi = 1024;
const mebi = kibi * kibi;
const drillKibi = 8;
const editorKibi = 160;
const compilerMebi = 18;

const rules: readonly Rule[] = [
  { bytes: drillKibi * kibi, gate: true, name: 'drill', wants: (step) => step.stage === 'drill' },
  { bytes: editorKibi * kibi, gate: true, name: 'editor', wants: (step) => step.stage === 'run' },
  {
    bytes: compilerMebi * mebi,
    gate: false,
    name: 'compiler',
    wants: (step) => step.wait === 'run',
  },
];

export { rules };
