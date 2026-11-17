import { addComplex, divideComplex, multiplyComplex, subtractComplex, type Complex } from "../models/circular-diagram";
import type { CalculatedElement, LineCascade } from "./cascade";

type PortState = { voltage: Complex; current: Complex };
export type LineSource = { voltage: Complex; impedanceOhm: Complex };
type LineElement = Extract<CalculatedElement, { kind: "line" }>;
export type SolvedLinePhasor = { element: LineElement; startM: number; endM: number; left: PortState; right: PortState };
export type SolvedPhasorCascade = { input: PortState; lines: readonly SolvedLinePhasor[]; lengthM: number };
type WaveReadings = { forward: Complex; backward: Complex; total: Complex; phaseDifferenceDeg: number | null };
export type LinePhasorInspection = { xM: number; voltage: WaveReadings; current: WaveReadings };

const finite = ({ re, im }: Complex) => Number.isFinite(re) && Number.isFinite(im);
const scale = ({ re, im }: Complex, factor: number): Complex => ({ re: re * factor, im: im * factor });
const normalized = ({ re, im }: Complex, factor: number): Complex => ({ re: re / factor, im: im / factor });
const peak = ({ re, im }: Complex) => Math.max(Math.abs(re), Math.abs(im));
const zero = (): Complex => ({ re: 0, im: 0 });

function divide(a: Complex, b: Complex, zeroError = "phasor-numeric-range") {
  const factor = peak(b);
  if (factor === 0) throw Error(zeroError);
  const result = divideComplex(normalized(a, factor), normalized(b, factor));
  if (!finite(result)) throw Error("phasor-numeric-range");
  return result;
}

function towardInput(matrix: CalculatedElement["matrix"], state: PortState): PortState {
  const { A, B, C, D } = matrix;
  const voltage = addComplex(multiplyComplex(A, state.voltage), multiplyComplex(B, state.current));
  const current = addComplex(multiplyComplex(C, state.voltage), multiplyComplex(D, state.current));
  if (!finite(voltage) || !finite(current)) throw Error("phasor-numeric-range");
  return { voltage, current };
}

export function solvePhasorCascade(cascade: LineCascade, source: LineSource): SolvedPhasorCascade {
  if (!finite(source.voltage) || !finite(source.impedanceOhm)) throw Error("invalid-source-phasor");
  const { elements, matrix, terminationOhm } = cascade;
  const factor = terminationOhm === "open" ? 1 : Math.max(1, peak(terminationOhm));
  const load = terminationOhm === "open"
    ? { voltage: { re: 1, im: 0 }, current: zero() }
    : { voltage: normalized(terminationOhm, factor), current: { re: 1 / factor, im: 0 } };
  const basis = towardInput(matrix, load);
  const coefficient = addComplex(basis.voltage, multiplyComplex(source.impedanceOhm, basis.current));
  if (!finite(coefficient)) throw Error("phasor-numeric-range");
  const gain = divide(source.voltage, coefficient, "phasor-singular-source");
  let state = { voltage: multiplyComplex(load.voltage, gain), current: multiplyComplex(load.current, gain) };

  let lengthM = 0;
  const positions = elements.map(element => {
    if (element.kind !== "line") return undefined;
    const startM = lengthM;
    lengthM += element.line.lengthM;
    return { startM, endM: lengthM };
  });
  if (!Number.isFinite(lengthM)) throw Error("phasor-numeric-range");

  const lines: SolvedLinePhasor[] = [];
  for (let i = elements.length - 1; i >= 0; i--) {
    const element = elements[i], right = state;
    state = towardInput(element.matrix, right);
    if (element.kind === "line") lines.push({ element, ...positions[i]!, left: state, right });
  }
  return { input: state, lines: lines.reverse(), lengthM };
}

function propagate(vector: Complex, gamma: Complex, distance: number): Complex {
  const angle = -gamma.im * distance, magnitude = Math.exp(-gamma.re * distance);
  return multiplyComplex(vector, { re: magnitude * Math.cos(angle), im: magnitude * Math.sin(angle) });
}

export function phasorPolar(value: Complex): { magnitude: number; phaseDeg: number | null } {
  const magnitude = Math.hypot(value.re, value.im);
  const angle = Math.atan2(value.im, value.re) * 180 / Math.PI;
  return { magnitude, phaseDeg: magnitude === 0 ? null : angle || 0 };
}

function readings(forward: Complex, backward: Complex): WaveReadings {
  const total = addComplex(forward, backward);
  if (![forward, backward, total].every(finite)) throw Error("phasor-numeric-range");
  const a = phasorPolar(forward).phaseDeg, b = phasorPolar(backward).phaseDeg;
  const phaseDifferenceDeg = a === null || b === null ? null : (a - b + 540) % 360 - 180;
  return { forward, backward, total, phaseDifferenceDeg };
}

export function inspectLinePhasors(solved: SolvedPhasorCascade, xM: number): LinePhasorInspection {
  if (!Number.isFinite(xM) || xM < 0 || xM > solved.lengthM) throw Error("phasor-position-out-of-range");
  // At an internal boundary the inspection uses the section closer to the load.
  const line = solved.lines.find((candidate, index) => xM < candidate.endM || index === solved.lines.length - 1);
  if (!line) throw Error("missing-line-section");
  const { gammaPerM, characteristicOhm } = line.element.line;
  const f0 = scale(addComplex(line.left.voltage, multiplyComplex(characteristicOhm, line.left.current)), .5);
  const bL = scale(subtractComplex(line.right.voltage, multiplyComplex(characteristicOhm, line.right.current)), .5);
  // Each wave is propagated in its own direction, avoiding positive lossy exponentials.
  const forward = propagate(f0, gammaPerM, xM - line.startM);
  const backward = propagate(bL, gammaPerM, line.endM - xM);
  return { xM, voltage: readings(forward, backward),
    current: readings(divide(forward, characteristicOhm), scale(divide(backward, characteristicOhm), -1)) };
}
