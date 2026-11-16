interface Params {
  readonly pG: number;
  readonly pL0: number;
  readonly pS: number;
  readonly pT: number;
}

interface Soft {
  readonly probCorrect: number;
  readonly weight: number;
}

interface Observation {
  readonly correct: boolean;
  readonly softEvidence?: Soft;
  readonly weight?: number;
}

const maxWeight = 2;
const examWeight = 1.5;
const defaultParams: Params = { pG: 0.2, pL0: 0.2, pS: 0.1, pT: 0.1 };

const chanceCorrect = (observation: Observation): number => {
  if (observation.softEvidence !== undefined) {
    return observation.softEvidence.probCorrect;
  }
  if (observation.correct) {
    return 1;
  }
  return 0;
};

const bktPrior = (pL: number, pT: number): number => pL + (1 - pL) * pT;

const bktPosterior = (prior: number, observation: Observation, params: Params): number => {
  const chance = chanceCorrect(observation);
  const givenMastered = chance * (1 - params.pS) + (1 - chance) * params.pS;
  const givenNot = chance * params.pG + (1 - chance) * (1 - params.pG);
  const seen = prior * givenMastered + (1 - prior) * givenNot;
  if (seen === 0) {
    return prior;
  }
  return (prior * givenMastered) / seen;
};

const weightOf = (observation: Observation): number =>
  Math.min(observation.softEvidence?.weight ?? observation.weight ?? 1, maxWeight);

const weigh = (prior: number, posterior: number, weight: number): number => {
  if (weight === 1) {
    return posterior;
  }
  return prior + (posterior - prior) * weight;
};

const bktUpdate = (pL: number, params: Params, observation: Observation): number => {
  const prior = bktPrior(pL, params.pT);
  const posterior = bktPosterior(prior, observation, params);
  const weighted = weigh(prior, posterior, weightOf(observation));
  return Math.max(0, Math.min(1, weighted));
};

const bktUpdateAfterExam = (pL: number, params: Params, correct: boolean): number =>
  bktUpdate(pL, params, { correct, weight: examWeight });

export {
  bktPosterior,
  bktPrior,
  bktUpdate,
  bktUpdateAfterExam,
  defaultParams,
  type Observation,
  type Params,
};
