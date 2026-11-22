import { parseBasis } from "./custom-basis";
import { resampleContour, type Complex } from "./math";
import { basisContourMaxPoints, basisExperimentMaxBytes, basisExpressionMaxLength, basisTermLimit, experimentBasisIds, experimentSampleCounts,
  type BasisAnalysis, type BasisExperiment, type BasisExperimentSource, type ExperimentBoundary } from "./basis-experiment-contract";

const maxSampleAmplitude = 10_000;

export function defaultBasisExperiment(): BasisExperiment {
  return {
    kind: "electrotutor-basis-experiment", schemaVersion: 1,
    source: { kind: "signal", expression: "sin(2*pi*x)+0.35*cos(6*pi*x)", boundary: "periodic" },
    sampleCount: 64, basis: "fourier", count: 8, level: 3,
  };
}

export function experimentBoundary(experiment: BasisExperiment): ExperimentBoundary {
  const source = experiment.source;
  return source.kind === "signal" ? source.boundary : source.closed ? "periodic" : "open";
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

function parseSignal(expression: string) {
  if (expression.length > basisExpressionMaxLength || /[\r\n]/.test(expression)) throw Error("invalid-expression");
  const normalized = expression.replace(/\s+/g, "").replace(/\bt\b/g, "x")
    .replace(/(sin|cos)\((?:(\d+(?:\.\d+)?|\.\d+)\*)?(?:pi|π)\*x\)/g, (_, name: string, factor?: string) =>
      `${name}(${Number(factor ?? 1) * Math.PI}*x)`)
    .replace(/(sin|cos)\(x\)/g, "$1(1*x)");
  const evaluate = parseBasis(normalized)?.[0];
  if (!evaluate) throw Error("invalid-expression");
  return evaluate;
}

export function sampleBasisExperiment(experiment: BasisExperiment): Complex[] {
  const { source, sampleCount } = experiment;
  const periodic = experimentBoundary(experiment) === "periodic";
  if (!(experimentSampleCounts as readonly number[]).includes(sampleCount)) throw Error("invalid-grid");
  if (source.kind === "signal") {
    const evaluate = parseSignal(source.expression);
    const divisor = periodic ? sampleCount : sampleCount - 1;
    return Array.from({ length: sampleCount }, (_, index) => {
      const re = evaluate(index / divisor);
      if (!finite(re, maxSampleAmplitude)) throw Error("invalid-expression");
      return { re, im: 0 };
    });
  }
  const points = source.points;
  if (points.length > basisContourMaxPoints || points.some(({ re, im }) => !finite(re, 1) || !finite(im, 1))) {
    throw Error("invalid-contour");
  }
  const distinct = new Set(points.map(({ re, im }) => `${re},${im}`));
  if (distinct.size < (periodic ? 3 : 2)) throw Error("insufficient-contour");
  const sampled = resampleContour(points, sampleCount, periodic);
  if (sampled.length !== sampleCount) throw Error("insufficient-contour");
  return sampled;
}

const integerIn = (value: unknown, low: number, high: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= low && value <= high;

function readSource(value: unknown): BasisExperimentSource {
  if (!record(value)) throw Error("invalid-archive");
  if (value.kind === "signal" && typeof value.expression === "string" && (value.boundary === "open" || value.boundary === "periodic")) {
    return { kind: "signal", expression: value.expression, boundary: value.boundary };
  }
  if (value.kind === "contour" && typeof value.closed === "boolean" && Array.isArray(value.points) && value.points.length <= basisContourMaxPoints) {
    const points = value.points.map((p: unknown) => {
      if (!record(p) || !finite(p.re, 1) || !finite(p.im, 1)) throw Error("invalid-contour");
      return { re: p.re, im: p.im };
    });
    return { kind: "contour", closed: value.closed, points };
  }
  throw Error("invalid-archive");
}

export function readBasisExperiment(text: string): BasisExperiment {
  if (text.length > basisExperimentMaxBytes || new TextEncoder().encode(text).length > basisExperimentMaxBytes) {
    throw Error("archive-limit");
  }
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw Error("invalid-archive"); }
  if (!record(value) || value.kind !== "electrotutor-basis-experiment" || value.schemaVersion !== 1) throw Error("invalid-archive");
  const { sampleCount, count, level } = value;
  const basis = experimentBasisIds.find(basis => basis === value.basis);
  if (!basis || typeof sampleCount !== "number" || !(experimentSampleCounts as readonly number[]).includes(sampleCount)
    || !integerIn(count, 1, basisTermLimit(basis, sampleCount)) || !integerIn(level, 1, Math.log2(sampleCount))) {
    throw Error("invalid-archive");
  }
  const experiment: BasisExperiment = {
    kind: "electrotutor-basis-experiment", schemaVersion: 1,
    source: readSource(value.source), sampleCount, basis, count, level,
  };
  sampleBasisExperiment(experiment);
  return experiment;
}

export function writeBasisExperiment(experiment: BasisExperiment, analysis: BasisAnalysis) {
  const { rms, max, terms } = analysis;
  return JSON.stringify({ ...experiment, result: { rms, max, coefficients: terms } }, null, 2);
}
