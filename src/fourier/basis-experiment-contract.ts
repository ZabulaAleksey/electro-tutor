import type { Complex } from "./math";

export const experimentBasisIds = ["fourier", "haar", "walsh", "daubechies", "symlets", "coiflets", "chebyshev", "legendre"] as const;
export type ExperimentBasisId = typeof experimentBasisIds[number];
export type ExperimentBoundary = "periodic" | "open";
export const experimentSampleCounts = [16, 32, 64, 128, 256] as const;
export const polynomialTermLimit = 16;
export const basisContourMaxPoints = 4096;
export const basisExperimentMaxBytes = 512 * 1024;
export const basisExpressionMaxLength = 180;

export const waveletBases: ReadonlySet<ExperimentBasisId> = new Set(["haar", "daubechies", "symlets", "coiflets"]);

export function basisTermLimit(basis: ExperimentBasisId, sampleCount: number) {
  return basis === "chebyshev" || basis === "legendre" ? Math.min(polynomialTermLimit, sampleCount) : sampleCount;
}

export type BasisTerm = Complex & {
  index: number;
  label: string;
  amplitude: number;
  active: boolean;
  frequency?: number;
};

export type BasisAnalysis = {
  terms: BasisTerm[];
  reconstruction: Complex[];
  contribution: (index: number) => Complex[];
  rms: number;
  max: number;
};

export type BasisAnalysisOptions = {
  basis: ExperimentBasisId;
  boundary: ExperimentBoundary;
  count: number;
  level: number;
};

export type BasisExperimentSource =
  | { kind: "signal"; expression: string; boundary: ExperimentBoundary }
  | { kind: "contour"; points: Complex[]; closed: boolean };

export type BasisExperiment = {
  kind: "electrotutor-basis-experiment";
  schemaVersion: 1;
  source: BasisExperimentSource;
  sampleCount: number;
  basis: ExperimentBasisId;
  count: number;
  level: number;
};
