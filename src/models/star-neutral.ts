import {
  addComplex, complexArgumentDegrees, complexFromPolar, complexMagnitude,
  divideComplex, multiplyComplex, subtractComplex, type Complex,
} from "./circular-diagram";

export type Phase = "A" | "B" | "C";
export type NeutralMode = "ideal" | "finite" | "open";
export type PhaseValues = Record<Phase, Complex>;
export type StarParameters = {
  uPhase: number;
  phases: PhaseValues;
  neutral: Complex;
  mode: NeutralMode;
};
export type StarResult = {
  sources: PhaseValues;
  displacement: Complex;
  voltages: PhaseValues;
  currents: PhaseValues;
  neutralCurrent: Complex;
};
export type StarCalculation =
  | { ok: true; result: StarResult }
  | { ok: false; reason: "phase-short" | "singular" | "range" };

export const PHASES: readonly Phase[] = ["A", "B", "C"];
export const PHASE_EPSILON = 1e-6;
export const MAX_INPUT = 1e6;
const ZERO: Complex = { re: 0, im: 0 };
const ONE: Complex = { re: 1, im: 0 };

export const STAR_PRESETS = {
  balanced: {
    uPhase: 230, mode: "ideal", neutral: { re: 0.5, im: 0 },
    phases: { A: { re: 46, im: 0 }, B: { re: 46, im: 0 }, C: { re: 46, im: 0 } },
  },
  unbalanced: {
    uPhase: 230, mode: "finite", neutral: { re: 12, im: 4 },
    phases: { A: { re: 38, im: 12 }, B: { re: 72, im: -18 }, C: { re: 24, im: 32 } },
  },
  open: {
    uPhase: 230, mode: "open", neutral: { re: 12, im: 4 },
    phases: { A: { re: 38, im: 12 }, B: { re: 72, im: -18 }, C: { re: 24, im: 32 } },
  },
  rlc: {
    uPhase: 230, mode: "finite", neutral: { re: 4, im: 8 },
    phases: { A: { re: 32, im: 30 }, B: { re: 55, im: -35 }, C: { re: 42, im: 0 } },
  },
} as const satisfies Record<string, StarParameters>;

export function rectangularToPolar(value: Complex): { magnitude: number; angle: number } {
  return { magnitude: complexMagnitude(value), angle: complexArgumentDegrees(value) };
}

export function polarToRectangular(magnitude: number, angle: number): Complex {
  return complexFromPolar(magnitude, angle);
}

function finiteComplex(value: Complex): boolean {
  return Number.isFinite(value.re) && Number.isFinite(value.im);
}

export function calculateStar(parameters: StarParameters): StarCalculation {
  const { uPhase, phases, neutral, mode } = parameters;
  if (!Number.isFinite(uPhase) || uPhase < 0 || uPhase > MAX_INPUT ||
      !PHASES.every(phase => finiteComplex(phases[phase]) &&
        Math.abs(phases[phase].re) <= MAX_INPUT && Math.abs(phases[phase].im) <= MAX_INPUT) ||
      !finiteComplex(neutral) || Math.abs(neutral.re) > MAX_INPUT ||
      Math.abs(neutral.im) > MAX_INPUT) return { ok: false, reason: "range" };
  if (PHASES.some(phase => complexMagnitude(phases[phase]) < PHASE_EPSILON)) {
    return { ok: false, reason: "phase-short" };
  }

  const sources: PhaseValues = {
    A: complexFromPolar(uPhase, 0),
    B: complexFromPolar(uPhase, -120),
    C: complexFromPolar(uPhase, 120),
  };
  let displacement: Complex = ZERO;
  if (mode !== "ideal" && !(mode === "finite" && complexMagnitude(neutral) === 0)) {
    const admittance = PHASES.map(phase => divideComplex(ONE, phases[phase]));
    const numerator = PHASES.reduce((sum, phase, index) =>
      addComplex(sum, multiplyComplex(sources[phase], admittance[index])), ZERO);
    const phaseSum = admittance.reduce(addComplex, ZERO);
    const denominator = mode === "open" ? phaseSum : addComplex(phaseSum, divideComplex(ONE, neutral));
    // Cancellation can make an open star mathematically indeterminate.
    if (complexMagnitude(denominator) <= 1e-12 * Math.max(1, ...admittance.map(complexMagnitude))) {
      return { ok: false, reason: "singular" };
    }
    displacement = divideComplex(numerator, denominator);
  }

  // Keep the singular diagnostic for mathematically indeterminate legacy inputs;
  // otherwise reject negative resistance before returning physical results.
  if (PHASES.some(phase => phases[phase].re < 0) || neutral.re < 0) {
    return { ok: false, reason: "range" };
  }

  const voltages = {} as PhaseValues;
  const currents = {} as PhaseValues;
  for (const phase of PHASES) {
    voltages[phase] = subtractComplex(sources[phase], displacement);
    currents[phase] = divideComplex(voltages[phase], phases[phase]);
  }
  const neutralCurrent = PHASES.reduce((sum, phase) => addComplex(sum, currents[phase]), ZERO);
  if (![displacement, neutralCurrent, ...Object.values(voltages), ...Object.values(currents)]
    .every(finiteComplex)) return { ok: false, reason: "range" };
  return { ok: true, result: { sources, displacement, voltages, currents, neutralCurrent } };
}
