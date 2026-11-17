import { addComplex, divideComplex, multiplyComplex, subtractComplex, type Complex } from "../models/circular-diagram";

export type RlgcSection = {
  rOhmM: number;
  lHenryM: number;
  gSiemensM: number;
  cFaradM: number;
  lengthM: number;
};

/** The current reference is toward the load at both ports. The matrix maps load to input. */
export type ChainMatrix = { A: Complex; B: Complex; C: Complex; D: Complex };
export type SteadyLineSection = {
  lengthM: number;
  frequencyHz: number;
  seriesOhmM: Complex;
  shuntSiemensM: Complex;
  gammaPerM: Complex;
  characteristicOhm: Complex;
  matrix: ChainMatrix;
};

export type LineTermination = "matched" | "open" | "short" | { impedanceOhm: Complex };
export type LineInputImpedance = { kind: "open" } | { kind: "finite"; impedanceOhm: Complex };

const finite = ({ re, im }: Complex) => Number.isFinite(re) && Number.isFinite(im);
const peak = ({ re, im }: Complex) => Math.max(Math.abs(re), Math.abs(im));
const scale = ({ re, im }: Complex, factor: number): Complex => ({ re: re * factor, im: im * factor });
const normalize = ({ re, im }: Complex, factor: number): Complex => ({ re: re / factor, im: im / factor });
const zero = (): Complex => ({ re: 0, im: 0 });
const cleanZero = ({ re, im }: Complex): Complex => ({ re: re === 0 ? 0 : re, im: im === 0 ? 0 : im });

function divide(a: Complex, b: Complex): Complex {
  const factor = peak(b);
  if (factor === 0) throw Error("line-numeric-range");
  return divideComplex(normalize(a, factor), normalize(b, factor));
}

/** The argument is normalized before this function is called. */
function principalRoot({ re, im }: Complex): Complex {
  const magnitude = Math.hypot(re, im);
  if (re >= 0) {
    const real = Math.sqrt((magnitude + re) / 2);
    return { re: real, im: real === 0 ? 0 : im / (2 * real) };
  }
  const imaginary = Math.sqrt((magnitude - re) / 2);
  return { re: Math.abs(im) / (2 * imaginary), im: im < 0 ? -imaginary : imaginary };
}

function sinCos(angle: number) {
  const eighth = Math.PI / 4, octant = Math.round(angle / eighth);
  const tolerance = Math.min(1e-12, 8 * Number.EPSILON * Math.abs(angle));
  if (octant !== 0 && Number.isSafeInteger(octant) && Math.abs(angle - octant * eighth) <= tolerance) {
    const h = Math.SQRT1_2;
    const sine = [0, h, 1, h, 0, -h, -1, -h];
    return { sin: sine[octant % 8], cos: sine[(octant + 2) % 8] };
  }
  return { sin: Math.sin(angle), cos: Math.cos(angle) };
}

/** Homogeneous passive RLGC section with the exp(jωt) phasor convention. */
export function calculateLineSection(section: RlgcSection, frequencyHz: number): SteadyLineSection {
  const { rOhmM, lHenryM, gSiemensM, cFaradM, lengthM } = section;
  if (![rOhmM, lHenryM, gSiemensM, cFaradM, lengthM, frequencyHz].every(Number.isFinite) ||
      rOhmM < 0 || lHenryM <= 0 || gSiemensM < 0 || cFaradM <= 0 || lengthM < 0 || frequencyHz <= 0) {
    throw Error("invalid-line-section");
  }
  const omega = 2 * Math.PI * frequencyHz;
  const seriesOhmM = { re: rOhmM, im: omega * lHenryM };
  const shuntSiemensM = { re: gSiemensM, im: omega * cFaradM };
  if (!finite(seriesOhmM) || !finite(shuntSiemensM) || seriesOhmM.im <= 0 || shuntSiemensM.im <= 0) {
    throw Error("line-numeric-range");
  }
  // Scale before multiplying z′y′ or dividing z′/y′ so their square roots
  // can remain representable even when the original product/ratio cannot.
  const zScale = peak(seriesOhmM), yScale = peak(shuntSiemensM);
  const z = normalize(seriesOhmM, zScale), y = normalize(shuntSiemensM, yScale);
  const sZ = Math.sqrt(zScale), sY = Math.sqrt(yScale);
  const gammaPerM = cleanZero(scale(principalRoot(multiplyComplex(z, y)), sZ * sY));
  const idealRatio = lHenryM / cFaradM;
  const characteristicOhm = rOhmM === 0 && gSiemensM === 0 && Number.isFinite(idealRatio) && idealRatio > 0
    ? { re: Math.sqrt(idealRatio), im: 0 }
    : cleanZero(scale(principalRoot(divideComplex(z, y)), sZ / sY));
  if (!finite(gammaPerM) || peak(gammaPerM) === 0 || !finite(characteristicOhm) || characteristicOhm.re <= 0) {
    throw Error("line-numeric-range");
  }

  const phase = scale(gammaPerM, lengthM);
  if (!finite(phase)) throw Error("line-numeric-range");
  const { sin, cos } = sinCos(phase.im);
  const ch = Math.cosh(phase.re), sh = Math.sinh(phase.re);
  const A = cleanZero({ re: ch * cos, im: sh * sin });
  const sinh = { re: sh * cos, im: ch * sin };
  // Evaluate sinh(w)/w near zero. This also retains a finite series or
  // shunt coefficient when w underflows but z′ℓ or y′ℓ is representable.
  const small = peak(phase) < 1e-4;
  const sinhc = small ? addComplex({ re: 1, im: 0 }, scale(multiplyComplex(phase, phase), 1 / 6)) : undefined;
  const B = cleanZero(sinhc
    ? multiplyComplex(scale(seriesOhmM, lengthM), sinhc)
    : multiplyComplex(characteristicOhm, sinh));
  const C = cleanZero(sinhc
    ? multiplyComplex(scale(shuntSiemensM, lengthM), sinhc)
    : divide(sinh, characteristicOhm));
  if (![A, B, C].every(finite)) throw Error("line-numeric-range");
  return { lengthM, frequencyHz, seriesOhmM, shuntSiemensM, gammaPerM, characteristicOhm, matrix: { A, B, C, D: { ...A } } };
}

export function matrixInputImpedance(matrix: ChainMatrix, load: Complex | "open"): LineInputImpedance {
  const { A, B, C, D } = matrix;
  if (load !== "open" && !finite(load)) throw Error("invalid-line-load");
  const factor = load === "open" ? 1 : Math.max(1, peak(load));
  const voltage = load === "open" ? { re: 1, im: 0 } : normalize(load, factor);
  const current = load === "open" ? 0 : 1 / factor;
  const numerator = addComplex(multiplyComplex(A, voltage), scale(B, current));
  const cTerm = multiplyComplex(C, voltage);
  const dTerm = scale(D, current);
  let denominator = addComplex(cTerm, dTerm);
  if (!finite(numerator) || !finite(denominator) || peak(C) === 0 && peak(D) === 0) {
    throw Error("line-numeric-range");
  }
  if (load === "open") {
    if (peak(C) === 0) return { kind: "open" };
  } else if (peak(C) > 0) {
    const pole = divide(scale(D, -1), C);
    if (finite(pole)) {
      if (load.re === pole.re && load.im === pole.im) {
        if (peak(numerator) === 0) throw Error("line-numeric-range");
        return { kind: "open" };
      }
      const cancellation = 8 * Number.EPSILON * Math.max(peak(cTerm), peak(dTerm));
      if (peak(denominator) <= cancellation) {
        // Evaluate C(Zload − Zpole) near cancellation. A representable
        // neighboring load must remain finite even when CZload + D rounds to zero.
        denominator = multiplyComplex(C, normalize(subtractComplex(load, pole), factor));
      }
    }
  }
  const impedanceOhm = cleanZero(divide(numerator, denominator));
  if (!finite(impedanceOhm)) throw Error("line-numeric-range");
  return { kind: "finite", impedanceOhm };
}

export function inputImpedance(line: SteadyLineSection, termination: LineTermination): LineInputImpedance {
  if (termination === "matched") return { kind: "finite", impedanceOhm: { ...line.characteristicOhm } };
  const load = termination === "open" ? "open" : termination === "short" ? zero() : termination.impedanceOhm;
  return matrixInputImpedance(line.matrix, load);
}
