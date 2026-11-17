import { addComplex, multiplyComplex, type Complex } from "../models/circular-diagram";
import {
  calculateLineSection, matrixInputImpedance, type ChainMatrix, type LineInputImpedance,
  type LineTermination, type RlgcSection, type SteadyLineSection,
} from "./line";

export type CascadeElement =
  | { kind: "line"; section: RlgcSection }
  | { kind: "series"; impedanceOhm: Complex }
  | { kind: "shunt"; admittanceSiemens: Complex };

export type CalculatedElement =
  | { kind: "line"; matrix: ChainMatrix; line: SteadyLineSection }
  | { kind: "series" | "shunt"; matrix: ChainMatrix };

export type LineCascade = {
  elements: readonly CalculatedElement[];
  matrix: ChainMatrix;
  terminationOhm: Complex | "open";
  input: LineInputImpedance;
};

const zero = (): Complex => ({ re: 0, im: 0 });
const one = (): Complex => ({ re: 1, im: 0 });
const finite = ({ re, im }: Complex) => Number.isFinite(re) && Number.isFinite(im);
const dot = (a: Complex, b: Complex, c: Complex, d: Complex) =>
  addComplex(multiplyComplex(a, b), multiplyComplex(c, d));
const identity = (): ChainMatrix => ({ A: one(), B: zero(), C: zero(), D: one() });

export function seriesMatrix(impedanceOhm: Complex): ChainMatrix {
  if (!finite(impedanceOhm)) throw Error("invalid-cascade-element");
  return { A: one(), B: { ...impedanceOhm }, C: zero(), D: one() };
}

export function shuntMatrix(admittanceSiemens: Complex): ChainMatrix {
  if (!finite(admittanceSiemens)) throw Error("invalid-cascade-element");
  return { A: one(), B: zero(), C: { ...admittanceSiemens }, D: one() };
}

/** Matrices are ordered from the source to the load. */
export function composeChainMatrices(matrices: readonly ChainMatrix[]): ChainMatrix {
  let accumulated = identity();
  for (const next of matrices) {
    const { A, B, C, D } = accumulated;
    accumulated = {
      A: dot(A, next.A, B, next.C),
      B: dot(A, next.B, B, next.D),
      C: dot(C, next.A, D, next.C),
      D: dot(C, next.B, D, next.D),
    };
    if (!Object.values(accumulated).every(finite)) throw Error("line-numeric-range");
  }
  return accumulated;
}

export function calculateCascade(
  elements: readonly CascadeElement[],
  frequencyHz: number,
  termination: LineTermination,
): LineCascade {
  const calculated = elements.map((element): CalculatedElement => {
    switch (element.kind) {
      case "line": {
        const line = calculateLineSection(element.section, frequencyHz);
        return { kind: "line", matrix: line.matrix, line };
      }
      case "series": return { kind: element.kind, matrix: seriesMatrix(element.impedanceOhm) };
      case "shunt": return { kind: element.kind, matrix: shuntMatrix(element.admittanceSiemens) };
      default: throw Error("invalid-cascade-element");
    }
  });
  const lastLine = calculated.filter(element => element.kind === "line").at(-1);
  if (!lastLine) throw Error("missing-line-section");

  let terminationOhm: Complex | "open";
  switch (termination) {
    case "matched": terminationOhm = { ...lastLine.line.characteristicOhm }; break;
    case "open": terminationOhm = "open"; break;
    case "short": terminationOhm = zero(); break;
    default: terminationOhm = { ...termination.impedanceOhm };
  }
  const matrix = composeChainMatrices(calculated.map(element => element.matrix));
  return { elements: calculated, matrix, terminationOhm, input: matrixInputImpedance(matrix, terminationOhm) };
}
