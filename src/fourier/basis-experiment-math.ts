import { basisTermLimit, waveletBases, type BasisAnalysis, type BasisAnalysisOptions, type BasisTerm,
  type ExperimentBasisId, type ExperimentBoundary } from "./basis-experiment-contract";
import { dctII, reconstructBasis, walsh } from "./bases";
import { periodicWavelet } from "./experiment-wavelets";
import { dft, orderCoefficients, reconstruct, type Complex } from "./math";

type AdapterResult = Pick<BasisAnalysis, "terms" | "reconstruction" | "contribution">;
type Adapter = (samples: Complex[], options: BasisAnalysisOptions) => AdapterResult;
type RealTransform = {
  labels: string[];
  project(values: number[]): number[];
  synthesize(coefficients: number[]): number[];
};
type PolynomialId = "chebyshev" | "legendre";

function fourier(samples: Complex[], {count}: BasisAnalysisOptions): AdapterResult {
  const ordered = orderCoefficients(dft(samples));
  const size = samples.length;
  const retained = ordered.slice(0, count);
  const terms = ordered.map(({k, re, im, amplitude}, position) => ({
    re, im, amplitude, index: k < 0 ? k + size : k, label: `k=${k}`, active: position < count, frequency: k,
  }));
  const atSamples = (coefficients: typeof ordered) => samples.map((_, index) => reconstruct(coefficients, index / size));
  return {
    terms,
    reconstruction: atSamples(retained),
    contribution(index) {
      const position = terms.findIndex(term => term.index === index);
      return atSamples(position < 0 ? [] : [ordered[position]]);
    },
  };
}

function pairedTransform(samples: Complex[], count: number, transform: RealTransform): AdapterResult {
  const real = transform.project(samples.map(({re}) => re));
  const imaginary = transform.project(samples.map(({im}) => im));
  const coefficients = transform.labels.map((label, index) => ({
    label, index, amplitude: Math.hypot(real[index], imaginary[index]), re: real[index], im: imaginary[index],
  }));
  coefficients.sort((left, right) => right.amplitude - left.amplitude || left.index - right.index);
  const terms: BasisTerm[] = coefficients.map((term, position) => ({...term, active: position < count}));
  function synthesis(selected: BasisTerm[]) {
    const re = Array<number>(samples.length).fill(0);
    const im = Array<number>(samples.length).fill(0);
    for (const term of selected) {
      re[term.index] = term.re;
      im[term.index] = term.im;
    }
    const reSamples = transform.synthesize(re);
    const imSamples = transform.synthesize(im);
    return reSamples.map((value, index) => ({re: value, im: imSamples[index]}));
  }
  return {
    terms,
    reconstruction: synthesis(terms.slice(0, count)),
    contribution(index) {
      const term = terms.find(entry => entry.index === index);
      return synthesis(term ? [term] : []);
    },
  };
}

function polynomialCoordinates(size: number, boundary: ExperimentBoundary) {
  const divisor = boundary === "periodic" ? size : size - 1;
  return Array.from({length: size}, (_, index) => 2 * index / divisor - 1);
}

function polynomialColumns(positions: number[], count: number, family: PolynomialId) {
  const columns: number[][] = [];
  for (let degree = 0; degree < count; degree++) {
    if (degree === 0) {
      columns.push(positions.map(() => 1));
    } else if (degree === 1) {
      columns.push(positions.slice());
    } else {
      const previous = columns[degree - 1];
      const earlier = columns[degree - 2];
      columns.push(positions.map((x, index) => family === "chebyshev"
        ? 2 * x * previous[index] - earlier[index]
        : ((2 * degree - 1) * x * previous[index] - (degree - 1) * earlier[index]) / degree));
    }
  }
  return columns;
}

function dot(left: number[], right: number[]) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function weightedPolynomialFit(samples: Complex[], columns: number[][], sqrtWeights: number[]) {
  const q: number[][] = [];
  const r = columns.map(() => Array<number>(columns.length).fill(0));
  for (const [column, atom] of columns.entries()) {
    const residual = atom.map((value, index) => value * sqrtWeights[index]);
    // Reorthogonalized Gram–Schmidt solves the weighted system without normal equations.
    for (let pass = 0; pass < 2; pass++) {
      for (const [row, vector] of q.entries()) {
        const projection = dot(residual, vector);
        r[row][column] += projection;
        for (let index = 0; index < residual.length; index++) residual[index] -= projection * vector[index];
      }
    }
    const norm = Math.sqrt(dot(residual, residual));
    if (norm <= 1e-12 || !Number.isFinite(norm)) throw new Error("singular-basis");
    r[column][column] = norm;
    q.push(residual.map(value => value / norm));
  }

  function solve(key: keyof Complex) {
    const weighted = samples.map((value, index) => value[key] * sqrtWeights[index]);
    const rhs = q.map(vector => dot(vector, weighted));
    for (let row = q.length - 1; row >= 0; row--) {
      for (let column = row + 1; column < q.length; column++) rhs[row] -= r[row][column] * rhs[column];
      rhs[row] /= r[row][row];
    }
    return rhs;
  }
  const real = solve("re");
  const imag = solve("im");
  return real.map((re, index) => ({re, im: imag[index]}));
}

function polynomial(samples: Complex[], {boundary, count}: BasisAnalysisOptions, family: PolynomialId): AdapterResult {
  const positions = polynomialCoordinates(samples.length, boundary);
  const columns = polynomialColumns(positions, count, family);
  const final = positions.length - 1;
  // Integrate the family's weight over each Voronoi cell, including the endpoints.
  const antiderivative = family === "chebyshev" ? Math.asin : (x: number) => x;
  const sqrtWeights = positions.map((x, index) => {
    const left = index === 0 ? -1 : (positions[index - 1] + x) / 2;
    const right = index === final ? 1 : (x + positions[index + 1]) / 2;
    return Math.sqrt(antiderivative(right) - antiderivative(left));
  });
  const coefficients = weightedPolynomialFit(samples, columns, sqrtWeights);
  const label = family === "chebyshev" ? "T" : "P";
  const terms = coefficients.map(({re, im}, index) => ({
    re, im, amplitude: Math.hypot(re, im), index, label: `${label}${index}`, active: true,
  }));
  return {
    terms,
    reconstruction: samples.map((_, index) => coefficients.reduce((sum, coefficient, degree) => {
      const factor = columns[degree][index];
      return {re: sum.re + coefficient.re * factor, im: sum.im + coefficient.im * factor};
    }, {re: 0, im: 0})),
    contribution(index) {
      const coefficient = coefficients[index];
      return coefficient ? columns[index].map(value => ({re: value * coefficient.re, im: value * coefficient.im}))
        : samples.map(() => ({re: 0, im: 0}));
    },
  };
}

const adapters: Record<ExperimentBasisId, Adapter> = {
  fourier,
  dct: (samples, {count}) => pairedTransform(samples, count, {
    labels: samples.map((_, index) => `D${index}`), project: dctII,
    synthesize: coefficients => reconstructBasis(coefficients, "dct"),
  }),
  walsh: (samples, {count}) => pairedTransform(samples, count, {
    labels: samples.map((_, index) => `W${index}`), project: walsh, synthesize: walsh,
  }),
  haar: (samples, {count, level}) => pairedTransform(samples, count, periodicWavelet("haar", samples.length, level)),
  daubechies: (samples, {count, level}) => pairedTransform(samples, count, periodicWavelet("daubechies", samples.length, level)),
  symlets: (samples, {count, level}) => pairedTransform(samples, count, periodicWavelet("symlets", samples.length, level)),
  coiflets: (samples, {count, level}) => pairedTransform(samples, count, periodicWavelet("coiflets", samples.length, level)),
  chebyshev: (samples, options) => polynomial(samples, options, "chebyshev"),
  legendre: (samples, options) => polynomial(samples, options, "legendre"),
};

export function analyzeBasis(samples: Complex[], options: BasisAnalysisOptions): BasisAnalysis {
  const {basis, boundary, count, level} = options;
  const size = samples.length;
  if (!Object.hasOwn(adapters, basis) || (boundary !== "open" && boundary !== "periodic")) throw new Error("basis-options");
  if (size < 2 || size > 256 || (size & (size - 1)) !== 0 ||
    samples.some(sample => !Number.isFinite(sample.re) || !Number.isFinite(sample.im))) throw new Error("basis-samples");
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("basis-count");
  if (waveletBases.has(basis) && (!Number.isInteger(level) || level < 1 || level > Math.log2(size))) {
    throw new Error("basis-level");
  }
  const result = adapters[basis](samples, {...options, count: Math.min(count, basisTermLimit(basis, size))});
  let max = 0;
  let squared = 0;
  for (const [index, reference] of samples.entries()) {
    const actual = result.reconstruction[index];
    const error = Math.hypot(reference.re - actual.re, reference.im - actual.im);
    max = Math.max(max, error);
    squared += error ** 2;
  }
  return {...result, max, rms: Math.sqrt(squared / size)};
}
