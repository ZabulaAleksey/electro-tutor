import {
  addComplex, complexArgumentDegrees, complexFromPolar, complexMagnitude,
  divideComplex, multiplyComplex, subtractComplex, type Complex,
} from "./circular-diagram";

export type Phase = "A" | "B" | "C";
export type NeutralMode = "ideal" | "finite" | "open";
export type PhaseValues = Record<Phase, Complex>;
export type PolarSource = Record<Phase,{magnitude:number;angle:number}>;
export const LINE_PAIRS = [["AB","A","B"],["BC","B","C"],["CA","C","A"]] as const;
export const phaseSources=(voltage:number,independent?:PolarSource):PhaseValues=>({
 A:complexFromPolar(independent?.A.magnitude??voltage,independent?.A.angle??0),
 B:complexFromPolar(independent?.B.magnitude??voltage,independent?.B.angle??-120),
 C:complexFromPolar(independent?.C.magnitude??voltage,independent?.C.angle??120),
});
export type StarParameters = {
  source?:PolarSource;
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
  lineCurrents?:PhaseValues;
};
export type StarPartialResult = {
  sources: PhaseValues;
  displacement?: Complex;
  voltages?: Partial<PhaseValues>;
  currents?: Partial<PhaseValues>;
  neutralCurrent?: Complex;
};
export type StarCalculation =
  | { ok: true; result: StarResult }
  | { ok: false; reason: "phase-short" | "singular" | "range" | "inconsistent" | "indeterminate" | "unstable";
      partial?: StarPartialResult };

export const PHASES: readonly Phase[] = ["A", "B", "C"];
export const PHASE_EPSILON = 1e-6;
export const MAX_INPUT = 1e6;
const ZERO: Complex = { re: 0, im: 0 };
const ONE: Complex = { re: 1, im: 0 };
const MIN_NORMAL = 2 ** -1022;

export const STAR_PRESETS = {
  balanced: {
    uPhase: 230, mode: "ideal", neutral: { re: 0, im: 0 },
    phases: { A: { re: 46, im: 0 }, B: { re: 46, im: 0 }, C: { re: 46, im: 0 } },
  },
  unbalanced: {
    uPhase: 230, mode: "finite", neutral: { re: 12, im: 4 },
    phases: { A: { re: 38, im: 12 }, B: { re: 72, im: -18 }, C: { re: 24, im: 32 } },
  },
  open: {
    uPhase: 230, mode: "open", neutral: { re: 0, im: 0 },
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

export function validSource(source:PolarSource){
 return PHASES.every(key=>source[key]&&Number.isFinite(source[key].magnitude)&&source[key].magnitude>=0&&
   source[key].magnitude<=MAX_INPUT&&Number.isFinite(source[key].angle)&&Math.abs(source[key].angle)<=180);
}
export function readThreePhaseDraft(input:unknown){
 try{
  const raw=input as {version:number;parameters:StarParameters;topology:"star"|"delta"};
  if(raw.version!==1||!["star","delta"].includes(raw.topology)||!["ideal","finite","open"].includes(raw.parameters.mode))return null;
  const result=raw.topology==="star"?calculateStar(raw.parameters):calculateDelta(raw.parameters);
  return result.ok?raw:null;
 }catch{return null;}
}
export function calculateDelta(parameters:StarParameters):StarCalculation{
 const {uPhase,phases,source}=parameters;
 if(!Number.isFinite(uPhase)||uPhase<0||uPhase>MAX_INPUT||source&&!validSource(source)||
   !PHASES.every(key=>finiteComplex(phases[key])&&phases[key].re>=0&&phases[key].re<=MAX_INPUT&&
     Math.abs(phases[key].im)<=MAX_INPUT))return {ok:false,reason:"range"};
 if(PHASES.some(key=>complexMagnitude(phases[key])<PHASE_EPSILON))return {ok:false,reason:"phase-short"};
 const sources=phaseSources(uPhase,source);
 const voltages={A:subtractComplex(sources.A,sources.B),B:subtractComplex(sources.B,sources.C),C:subtractComplex(sources.C,sources.A)};
 const currents={A:divideComplex(voltages.A,phases.A),B:divideComplex(voltages.B,phases.B),C:divideComplex(voltages.C,phases.C)};
 const lineCurrents={A:subtractComplex(currents.A,currents.C),B:subtractComplex(currents.B,currents.A),C:subtractComplex(currents.C,currents.B)};
 return {ok:true,result:{sources,voltages,currents,lineCurrents,displacement:ZERO,neutralCurrent:ZERO}};
}

function finiteComplex(value: Complex): boolean {
  return Number.isFinite(value.re) && Number.isFinite(value.im);
}

function componentScale(value: Complex): number {
  return Math.max(Math.abs(value.re), Math.abs(value.im));
}

function scaledDivide(a: Complex, b: Complex): Complex {
  const numeratorScale = componentScale(a);
  if (numeratorScale === 0) return ZERO;
  const denominatorScale = componentScale(b);
  const normalized = divideComplex(
    { re: a.re / numeratorScale, im: a.im / numeratorScale },
    { re: b.re / denominatorScale, im: b.im / denominatorScale },
  );
  const ratio = numeratorScale / denominatorScale;
  const rescale = (value: number) => {
    if (!Number.isFinite(ratio)) return (value * numeratorScale) / denominatorScale;
    if (ratio < MIN_NORMAL) return (value / denominatorScale) * numeratorScale;
    return value * ratio;
  };
  return { re: rescale(normalized.re), im: rescale(normalized.im) };
}

function phaseValuesFor(value: (phase: Phase) => Complex): PhaseValues {
  return { A: value("A"), B: value("B"), C: value("C") };
}

function starSources({ source, uPhase }: StarParameters): PhaseValues {
  if (!source) return phaseSources(uPhase);
  return phaseValuesFor(phase => {
    const { magnitude, angle } = source[phase];
    if (magnitude === 0) return ZERO;
    if (angle === 0) return { re: magnitude, im: 0 };
    if (Math.abs(angle) === 180) return { re: -magnitude, im: 0 };
    if (Math.abs(angle) === 90) return { re: 0, im: Math.sign(angle) * magnitude };
    return complexFromPolar(magnitude, angle);
  });
}

function sum(values: readonly Complex[]): Complex {
  const total = values.reduce(addComplex, ZERO);
  if (finiteComplex(total) || values.some(value => !finiteComplex(value))) return total;
  const scale = Math.max(...values.map(componentScale));
  const normalized = values.reduce((acc, value) =>
    addComplex(acc, { re: value.re / scale, im: value.im / scale }), ZERO);
  return { re: normalized.re * scale, im: normalized.im * scale };
}

function negated(value: Complex): Complex {
  return { re: -value.re, im: -value.im };
}

function knownPhases(values: Partial<PhaseValues>): Partial<PhaseValues> {
  const result: Partial<PhaseValues> = {};
  for (const phase of PHASES) {
    const value = values[phase];
    if (value && finiteComplex(value)) result[phase] = value;
  }
  return result;
}

function finishStar(result: StarResult): StarCalculation {
  const { sources, displacement, voltages, currents, neutralCurrent } = result;
  if ([displacement, neutralCurrent, ...Object.values(voltages), ...Object.values(currents)].every(finiteComplex)) {
    return { ok: true, result };
  }
  return { ok: false, reason: "unstable", partial: {
    sources, displacement: finiteComplex(displacement) ? displacement : undefined,
    voltages: knownPhases(voltages), currents: knownPhases(currents),
    neutralCurrent: finiteComplex(neutralCurrent) ? neutralCurrent : undefined,
  } };
}

function sameSource(parameters: StarParameters, first: Phase, second: Phase): boolean {
  if (!parameters.source) return parameters.uPhase === 0;
  const a = parameters.source[first];
  const b = parameters.source[second];
  return a.magnitude === b.magnitude && (a.magnitude === 0 || a.angle === b.angle || Math.abs(a.angle - b.angle) === 360);
}

function solvePinnedStar(parameters: StarParameters, sources: PhaseValues, ideal: boolean, shorts: Phase[]): StarCalculation {
  const { mode, neutral, phases } = parameters;
  const [first] = shorts;
  const displacement = ideal ? ZERO : sources[first];
  const allows = (phase: Phase) => ideal
    ? (parameters.source?.[phase].magnitude ?? parameters.uPhase) === 0
    : phase === first || sameSource(parameters, first, phase);
  const compatible = shorts.every(allows);
  if (!compatible && !ideal) {
    const voltages: Partial<PhaseValues> = {};
    for (const phase of shorts) voltages[phase] = ZERO;
    return { ok: false, reason: "inconsistent", partial: { sources, voltages, neutralCurrent: mode === "open" ? ZERO : undefined } };
  }
  const voltages = phaseValuesFor(phase => shorts.includes(phase) && allows(phase)
    ? ZERO : subtractComplex(sources[phase], displacement));
  const currents: Partial<PhaseValues> = {};
  for (const phase of PHASES) {
    if (!shorts.includes(phase)) currents[phase] = scaledDivide(voltages[phase], phases[phase]);
  }
  if (!compatible) {
    const knownVoltages: Partial<PhaseValues> = {};
    for (const phase of PHASES) {
      if (!shorts.includes(phase) || allows(phase)) knownVoltages[phase] = voltages[phase];
    }
    return { ok: false, reason: "inconsistent", partial: {
      sources, displacement, voltages: knownVoltages, currents: knownPhases(currents),
    } };
  }
  const neutralCurrent = ideal
    ? (shorts.length ? undefined : sum(Object.values(currents)))
    : mode === "open" ? ZERO : scaledDivide(displacement, neutral);
  if (neutralCurrent === undefined || shorts.length > 1) {
    return { ok: false, reason: "indeterminate", partial: {
      sources, displacement, voltages, currents: knownPhases(currents),
      neutralCurrent: neutralCurrent && finiteComplex(neutralCurrent) ? neutralCurrent : undefined,
    } };
  }
  if (shorts.length === 1) currents[first] = sum([neutralCurrent, ...Object.values(currents).map(negated)]);
  return finishStar({ sources, displacement, voltages, currents: currents as PhaseValues, neutralCurrent });
}

export function calculateStar(parameters: StarParameters): StarCalculation {
  const { uPhase, phases, neutral, mode } = parameters;
  if (parameters.source&&!validSource(parameters.source) || !Number.isFinite(uPhase) || uPhase < 0 || uPhase > MAX_INPUT ||
      !PHASES.every(phase => finiteComplex(phases[phase]) &&
        Math.abs(phases[phase].re) <= MAX_INPUT && Math.abs(phases[phase].im) <= MAX_INPUT) ||
      !finiteComplex(neutral) || Math.abs(neutral.re) > MAX_INPUT ||
      Math.abs(neutral.im) > MAX_INPUT) return { ok: false, reason: "range" };
  const sources = starSources(parameters);
  const invalidResistance = PHASES.some(phase => phases[phase].re < 0) || neutral.re < 0;
  const shorts = PHASES.filter(phase => componentScale(phases[phase]) === 0);
  const ideal = mode === "ideal" || (mode === "finite" && componentScale(neutral) === 0);
  if (ideal || shorts.length) return invalidResistance
    ? { ok: false, reason: "range" } : solvePinnedStar(parameters, sources, ideal, shorts);

  const branches: { key: Phase | "N"; impedance: Complex; source: Complex }[] = PHASES.map(key => ({
    key, impedance: phases[key], source: sources[key],
  }));
  if (mode === "finite") branches.push({ key: "N", impedance: neutral, source: ZERO });
  const reference = branches.reduce((smallest, branch) =>
    componentScale(branch.impedance) < componentScale(smallest.impedance) ? branch : smallest);
  // Scale every admittance by one actual impedance, and solve for the offset from
  // that branch's source. Its current is recovered by KCL even if the offset underflows.
  const others = branches.filter(branch => branch !== reference).map(branch => ({
    ...branch, weight: scaledDivide(reference.impedance, branch.impedance),
  }));
  const denominator = sum([ONE, ...others.map(branch => branch.weight)]);
  const denominatorScale = 1 + others.reduce((total, branch) => total + complexMagnitude(branch.weight), 0);
  const denominatorMagnitude = complexMagnitude(denominator);
  if (invalidResistance) return { ok: false, reason: denominatorMagnitude <= 1e-12 * denominatorScale ? "singular" : "range" };

  const partial = { sources, neutralCurrent: mode === "open" ? ZERO : undefined };
  const terms = others.map(branch => multiplyComplex(branch.weight, subtractComplex(branch.source, reference.source)));
  const numerator = sum(terms);
  if (denominatorMagnitude === 0) {
    if (componentScale(numerator) === 0) return { ok: false, reason: "indeterminate", partial };
    const tolerance = 8 * Number.EPSILON * terms.reduce((total, term) => total + complexMagnitude(term), 0);
    return { ok: false, reason: complexMagnitude(numerator) <= tolerance ? "unstable" : "inconsistent", partial };
  }
  if (denominatorMagnitude <= 1e-12 * denominatorScale) return { ok: false, reason: "unstable", partial };

  const offset = scaledDivide(numerator, denominator);
  const displacement = addComplex(reference.source, offset);
  const voltages = phaseValuesFor(phase => subtractComplex(subtractComplex(sources[phase], reference.source), offset));
  const currents: Partial<PhaseValues> = {};
  for (const branch of others) {
    if (branch.key === "N") continue;
    const voltage = voltages[branch.key];
    if (componentScale(voltage) < MIN_NORMAL && componentScale(branch.impedance) < MIN_NORMAL) {
      // Apply the unscaled branch admittances before forming a subnormal voltage drop.
      const contributions = branches.filter(peer => peer.key !== branch.key).map(peer =>
        scaledDivide(multiplyComplex(subtractComplex(branch.source, peer.source), branch.weight), peer.impedance));
      currents[branch.key] = scaledDivide(sum(contributions), denominator);
    } else {
      currents[branch.key] = scaledDivide(voltage, branch.impedance);
    }
  }
  const neutralCurrent = mode === "open" ? ZERO : reference.key === "N"
    ? sum(Object.values(currents)) : scaledDivide(displacement, neutral);
  if (reference.key !== "N") currents[reference.key] = sum([neutralCurrent, ...Object.values(currents).map(negated)]);
  return finishStar({ sources, displacement, voltages, currents: currents as PhaseValues, neutralCurrent });
}
