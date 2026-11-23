import { type Rule } from './plan';

const kibi = 1024;
const mebi = kibi * kibi;
const drillKibi = 8;
const editorKibi = 160;
const compilerMebi = 18;

const rules: readonly Rule[] = [
  {
    bytes: drillKibi * kibi,
    early: true,
    gate: true,
    lead: 0,
    name: 'drill',
    wants: (step) => step.stage === 'drill',
  },
  {
    bytes: editorKibi * kibi,
    early: true,
    gate: true,
    lead: 0,
    name: 'editor',
    wants: (step) => step.stage === 'run',
  },
  {
    bytes: compilerMebi * mebi,
    early: false,
    gate: false,
    lead: 1,
    name: 'compiler',
    wants: (step) => step.free === true,
  },
];

export { rules };
