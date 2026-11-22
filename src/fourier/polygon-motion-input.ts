import { contourShape } from "./contour";
import type { Complex } from "./math";
import { defaultMotionOptions, motionFixtureSeed, motionJsonMaxBytes, motionMaxComponents, motionMaxPoints,
  motionMaxScale, motionSampleCount, motionShapes, type MotionOptions, type PolygonMotion,
  type PolygonMotionExperiment, type PolygonMotionResult } from "./polygon-motion-contract";

export function motionPresetPoints(preset: "square" | "circle" | "star"): Complex[] {
  if (preset === "square") return contourShape("square", 4);
  let state = motionFixtureSeed;
  const count = preset === "circle" ? motionSampleCount : 10;
  return Array.from({ length: count }, (_, index) => {
    const angle = Math.PI / 2 + index * (preset === "star" ? Math.PI / 5 : 2 * Math.PI / count);
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const radius = preset === "circle" ? 1 : (index % 2 === 0 ? .90 : .37) + .08 * (state >>> 0) / 2 ** 32;
    return { re: radius * Math.cos(angle), im: radius * Math.sin(angle) };
  });
}

export function defaultPolygonExperiment(): PolygonMotionExperiment {
  return { kind: "electrotutor-polygon-motion", schemaVersion: 1, points: motionPresetPoints("square"), options: { ...defaultMotionOptions } };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function within(value: unknown, low: number, high: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= low && value <= high;
}

function integerWithin(value: unknown, low: number, high: number): value is number {
  return within(value, low, high) && Number.isInteger(value);
}

export function checkedMotionPoints(value: unknown): Complex[] {
  if (!Array.isArray(value) || value.length < 3 || value.length > motionMaxPoints) throw Error("invalid-contour");
  const points = value.map((point: unknown) => {
    if (!record(point) || !within(point.re, -1, 1) || !within(point.im, -1, 1)) throw Error("invalid-contour");
    return { re: point.re, im: point.im };
  });
  if (new Set(points.map(({ re, im }) => `${re},${im}`)).size < 3) throw Error("invalid-contour");
  return points;
}

function readOptions(value: unknown): MotionOptions {
  if (!record(value)) throw Error("invalid-archive");
  const family = value.family === "all" ? value.family : motionShapes.find(shape => shape === value.family);
  const { sides, aspect, count } = value;
  if (!family || !integerWithin(sides, 3, 12) || !within(aspect, 1.1, 3) || !integerWithin(count, 1, motionMaxComponents)) {
    throw Error("invalid-archive");
  }
  return { family, sides, aspect, count };
}

function readMotion(value: unknown, options: MotionOptions): PolygonMotion {
  if (!record(value)) throw Error("invalid-archive");
  const shape = motionShapes.find(shape => shape === value.shape);
  const { scale, angleDegrees, phaseIndex, direction } = value;
  if (!shape || (options.family !== "all" && options.family !== shape) || !within(scale, 0, motionMaxScale)
    || !within(angleDegrees, -180, 180) || !integerWithin(phaseIndex, 0, motionSampleCount - 1)
    || (direction !== 1 && direction !== -1)) throw Error("invalid-archive");
  return { shape, scale, angleDegrees, phaseIndex, direction };
}

export function readPolygonExperiment(text: string): PolygonMotionExperiment {
  if (text.length > motionJsonMaxBytes || new TextEncoder().encode(text).length > motionJsonMaxBytes) throw Error("archive-limit");
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { throw Error("invalid-archive"); }
  if (!record(value) || value.kind !== "electrotutor-polygon-motion" || value.schemaVersion !== 1) throw Error("invalid-archive");
  const options = readOptions(value.options);
  const points = checkedMotionPoints(value.points);
  const result: PolygonMotionExperiment = { kind: "electrotutor-polygon-motion", schemaVersion: 1, points, options };
  if (value.components !== undefined) {
    if (!Array.isArray(value.components) || value.components.length > options.count) throw Error("invalid-archive");
    result.components = value.components.map((row) => readMotion(row, options));
  }
  return result;
}

export function writePolygonExperiment(experiment: PolygonMotionExperiment, result: PolygonMotionResult) {
  return JSON.stringify({ ...experiment, components: result.components, result: { rms: result.rms, max: result.max } }, null, 2);
}
