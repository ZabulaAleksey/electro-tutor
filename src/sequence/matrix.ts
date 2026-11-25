import { addComplex, complexMagnitude, multiplyComplex, subtractComplex, type Complex } from "../models/circular-diagram";
import { z, type Matrix3, type Triple } from "./contract";

type Equation = { coefficients: Map<number, Complex>; rhs: Complex };
type MatrixFailure = { ok: false; reason: "inconsistent" | "indeterminate" | "range" };
type MatrixSolution = { ok: true; values: Complex[] } | MatrixFailure;
type MnaSolution = { ok: true; values: Complex[]; maxResidual: number } | MatrixFailure;

const isZero = (value: Complex) => value.re === 0 && value.im === 0;
const scaled = (value: Complex, by: number): Complex => z(value.re * by, value.im * by);

export function matrixVector(matrix: Matrix3, vector: Triple): Triple {
  const evaluate = (row: Triple) => row.map((term, i) => multiplyComplex(term, vector[i])).reduce(addComplex, z());
  return [evaluate(matrix[0]), evaluate(matrix[1]), evaluate(matrix[2])];
}

export class SequenceMna {
  private equations: Equation[] = [];
  private phaseBlocks: number[] = [];

  allocate(): number {
    this.equations.push({ coefficients: new Map(), rhs: z() });
    return this.equations.length - 1;
  }

  allocatePhases(): [number, number, number] {
    const block: [number, number, number] = [this.allocate(), this.allocate(), this.allocate()];
    this.phaseBlocks.push(block[0]);
    return block;
  }

  stamp(row: number, column: number, value: Complex) {
    if (row < 0 || column < 0 || isZero(value)) return;
    const coefficients = this.equations[row].coefficients;
    coefficients.set(column, addComplex(coefficients.get(column) ?? z(), value));
  }

  setRhs(row: number, rhs: Complex) {
    this.equations[row].rhs = rhs;
  }

  solve(gaugeRows: readonly number[], toPhase: Matrix3, toSequence: Matrix3): MnaSolution {
    const equations = this.equations.map(({ coefficients, rhs }) => ({ coefficients: new Map(coefficients), rhs }));
    for (const row of gaugeRows) equations[row] = { coefficients: new Map([[row, z(1)]]), rhs: z() };

    // x_abc = T x_012 in each complete voltage/current unknown block.
    for (const row of equations) {
      for (const start of this.phaseBlocks) {
        const old = [row.coefficients.get(start), row.coefficients.get(start + 1), row.coefficients.get(start + 2)];
        if (old.every(value => value === undefined)) continue;
        for (let column = 0; column < 3; column++) {
          const value = old.reduce<Complex>((sum, term, k) => term
            ? addComplex(sum, multiplyComplex(term, toPhase[k][column])) : sum, z());
          if (isZero(value)) row.coefficients.delete(start + column);
          else row.coefficients.set(start + column, value);
        }
      }
    }

    // T^-1 A T x_012 = T^-1 b in each complete KCL/drop equation block.
    // Neutral equations and phase-specific shunt constraints remain scalar.
    for (const start of this.phaseBlocks) {
      const old = [equations[start], equations[start + 1], equations[start + 2]] as const;
      const rhs = matrixVector(toSequence, [old[0].rhs, old[1].rhs, old[2].rhs]);
      for (let row = 0; row < 3; row++) {
        const coefficients = new Map<number, Complex>();
        for (const [k, equation] of old.entries()) {
          for (const [column, value] of equation.coefficients) {
            const term = multiplyComplex(toSequence[row][k], value);
            coefficients.set(column, addComplex(coefficients.get(column) ?? z(), term));
          }
        }
        equations[start + row] = { coefficients, rhs: rhs[row] };
      }
    }

    const solved = eliminate(equations);
    if (!solved.ok) return solved;
    const values = solved.values;
    for (const start of this.phaseBlocks) {
      const phase = matrixVector(toPhase, [values[start], values[start + 1], values[start + 2]]);
      phase.forEach((value, i) => { values[start + i] = value; });
    }
    if (values.some(value => !Number.isFinite(value.re) || !Number.isFinite(value.im))) return { ok: false, reason: "range" };

    // Include the original KCL rows removed by reference-gauge fixing.
    let maxResidual = 0;
    for (const { coefficients, rhs } of this.equations) {
      let lhs = z(), scale = complexMagnitude(rhs);
      for (const [column, coefficient] of coefficients) {
        const term = multiplyComplex(coefficient, values[column]);
        lhs = addComplex(lhs, term);
        scale += complexMagnitude(term);
      }
      const residual = complexMagnitude(subtractComplex(lhs, rhs)) / Math.max(1, scale);
      maxResidual = Math.max(maxResidual, residual);
    }
    if (!(maxResidual < 1e-8)) return { ok: false, reason: "range" };
    return { ok: true, values, maxResidual };
  }
}

function eliminate(equations: Equation[]): MatrixSolution {
  const size = equations.length;
  const real: Float64Array[] = [], imag: Float64Array[] = [];
  for (const { coefficients, rhs } of equations) {
    const realRow = new Float64Array(size + 1), imagRow = new Float64Array(size + 1);
    const scale = Math.max(0, ...Array.from(coefficients.values(), complexMagnitude)) || 1;
    for (const [column, value] of coefficients) {
      realRow[column] = value.re / scale;
      imagRow[column] = value.im / scale;
    }
    realRow[size] = rhs.re / scale;
    imagRow[size] = rhs.im / scale;
    real.push(realRow);
    imag.push(imagRow);
  }

  const columnScale = new Float64Array(size);
  for (let column = 0; column < size; column++) {
    const largest = Math.max(...real.map((row, i) => Math.hypot(row[column], imag[i][column])));
    columnScale[column] = largest || 1;
    for (let row = 0; row < size; row++) {
      real[row][column] /= columnScale[column];
      imag[row][column] /= columnScale[column];
    }
  }

  const initialRhsMagnitude = Math.max(1, ...real.map((row, i) => Math.hypot(row[size], imag[i][size])));
  const tolerance = 1e-12;
  let rank = 0;
  for (let column = 0; column < size; column++) {
    let pivot = rank;
    for (let i = rank + 1; i < size; i++) {
      if (Math.hypot(real[i][column], imag[i][column]) > Math.hypot(real[pivot][column], imag[pivot][column])) pivot = i;
    }
    if (Math.hypot(real[pivot][column], imag[pivot][column]) < tolerance) continue;
    [real[rank], real[pivot]] = [real[pivot], real[rank]];
    [imag[rank], imag[pivot]] = [imag[pivot], imag[rank]];
    const pr = real[rank][column], pi = imag[rank][column], squared = pr * pr + pi * pi;
    for (let row = rank + 1; row < size; row++) {
      const ar = real[row][column], ai = imag[row][column];
      if (ar === 0 && ai === 0) continue;
      const factorR = (ar * pr + ai * pi) / squared, factorI = (ai * pr - ar * pi) / squared;
      real[row][column] = 0;
      imag[row][column] = 0;
      for (let j = column + 1; j <= size; j++) {
        const br = real[rank][j], bi = imag[rank][j];
        real[row][j] -= factorR * br - factorI * bi;
        imag[row][j] -= factorR * bi + factorI * br;
      }
    }
    rank++;
  }

  if (rank < size) {
    const contradictory = real.slice(rank).some((row, i) => Math.hypot(row[size], imag[i + rank][size]) > tolerance * initialRhsMagnitude * 8);
    return { ok: false, reason: contradictory ? "inconsistent" : "indeterminate" };
  }

  const normalized = Array<Complex>(size);
  for (let i = size - 1; i >= 0; i--) {
    let re = real[i][size], im = imag[i][size];
    for (let j = i + 1; j < size; j++) {
      const coefficientR = real[i][j], coefficientI = imag[i][j];
      const value = normalized[j];
      re -= coefficientR * value.re - coefficientI * value.im;
      im -= coefficientR * value.im + coefficientI * value.re;
    }
    const ar = real[i][i], ai = imag[i][i], squared = ar * ar + ai * ai;
    normalized[i] = z((re * ar + im * ai) / squared, (im * ar - re * ai) / squared);
  }
  return { ok: true, values: normalized.map((value, i) => scaled(value, 1 / columnScale[i])) };
}
