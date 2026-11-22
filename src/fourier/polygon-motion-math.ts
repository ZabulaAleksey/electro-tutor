import { resampleContour, type Complex } from "./math";
import {
  motionMaxComponents, motionMaxPoints, motionMaxScale, motionSampleCount, motionShapes,
  type MotionOptions, type MotionShape, type PolygonMotion, type PolygonMotionResult,
} from "./polygon-motion-contract";

const sampleMask = motionSampleCount - 1;
const degreesPerRadian = 180 / Math.PI;
const directions = [1, -1] as const;
const residualFloor = 1e-12;

type MotionAtom = { shape: MotionShape; samples: Complex[]; pointAt: (time: number) => Complex };

function validateOptions({ family, sides, aspect, count }: MotionOptions) {
  if (family !== "all" && !motionShapes.includes(family) ||
    !Number.isInteger(sides) || sides < 3 || sides > 12 ||
    !Number.isFinite(aspect) || aspect < 1.1 || aspect > 3 ||
    !Number.isInteger(count) || count < 1 || count > motionMaxComponents) throw Error("invalid-motion-options");
}

function validateComponent(component: PolygonMotion, { family }: MotionOptions) {
  const { shape, scale, angleDegrees, phaseIndex, direction } = component;
  if (!motionShapes.includes(shape) || (family !== "all" && family !== shape) ||
    !Number.isFinite(scale) || scale < 0 || scale > motionMaxScale ||
    !Number.isFinite(angleDegrees) || Math.abs(angleDegrees) > 180 ||
    !Number.isInteger(phaseIndex) || phaseIndex < 0 || phaseIndex >= motionSampleCount ||
    (direction !== 1 && direction !== -1)) throw Error("invalid-motion-component");
}

function squaredNorm({ re, im }: Complex) {
  return re * re + im * im;
}

function sampleMean(values: Complex[]): Complex {
  const sum = values.reduce((center, value) => {
    center.re += value.re;
    center.im += value.im;
    return center;
  }, { re: 0, im: 0 });
  return { re: sum.re / values.length, im: sum.im / values.length };
}

function periodic(time: number) {
  return time - Math.floor(time);
}

function regularVertices(sides: number, start = Math.PI / 2): Complex[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = start + 2 * Math.PI * index / sides;
    return { re: Math.cos(angle), im: Math.sin(angle) };
  });
}

function polygonVertices(shape: Exclude<MotionShape, "circle">, { sides, aspect }: MotionOptions): Complex[] {
  switch (shape) {
    case "triangle": return regularVertices(3);
    case "square": return [{ re: 1, im: 1 }, { re: -1, im: 1 }, { re: -1, im: -1 }, { re: 1, im: -1 }];
    case "rectangle": {
      const halfHeight = 1 / aspect;
      return [{ re: -1, im: -halfHeight }, { re: 1, im: -halfHeight },
        { re: 1, im: halfHeight }, { re: -1, im: halfHeight }];
    }
    case "polygon": return regularVertices(sides);
  }
}

function arclengthEvaluator(vertices: Complex[]) {
  const closed = [...vertices, vertices[0]];
  const distances = [0];
  for (let index = 1; index < closed.length; index++) {
    const start = closed[index - 1];
    const end = closed[index];
    distances.push(distances[index - 1] + Math.hypot(end.re - start.re, end.im - start.im));
  }
  const perimeter = distances[distances.length - 1];
  return (time: number): Complex => {
    const distance = periodic(time) * perimeter;
    let edge = 0;
    while (edge + 1 < vertices.length && distance > distances[edge + 1]) edge++;
    const fraction = (distance - distances[edge]) / (distances[edge + 1] - distances[edge]);
    const start = closed[edge];
    const end = closed[edge + 1];
    return { re: start.re + fraction * (end.re - start.re), im: start.im + fraction * (end.im - start.im) };
  };
}

const lastAtoms = new Map<MotionShape, { parameter: number; atom: MotionAtom }>();

function atomFor(shape: MotionShape, options: MotionOptions): MotionAtom {
  const parameter = shape === "polygon" ? options.sides : shape === "rectangle" ? options.aspect : 0;
  const last = lastAtoms.get(shape);
  if (last?.parameter === parameter) return last.atom;

  const rawPointAt = shape === "circle"
    ? (time: number) => ({ re: Math.cos(time * 2 * Math.PI), im: Math.sin(time * 2 * Math.PI) })
    : arclengthEvaluator(polygonVertices(shape, options));
  const rawSamples = Array.from({ length: motionSampleCount }, (_, index) => rawPointAt(index / motionSampleCount));
  const mean = sampleMean(rawSamples);
  const energy = rawSamples.reduce((sum, { re, im }) => sum + squaredNorm({ re: re - mean.re, im: im - mean.im }), 0);
  const rms = Math.sqrt(energy / motionSampleCount);
  const normalize = ({ re, im }: Complex) => ({ re: (re - mean.re) / rms, im: (im - mean.im) / rms });
  const atom = { shape, samples: rawSamples.map(normalize), pointAt: (time: number) => normalize(rawPointAt(periodic(time))) };
  lastAtoms.set(shape, { parameter, atom });
  return atom;
}

function complexCoefficient({ angleDegrees, scale }: PolygonMotion): Complex {
  const angle = angleDegrees / degreesPerRadian;
  return { re: scale * Math.cos(angle), im: scale * Math.sin(angle) };
}

function transform(point: Complex, coefficient: Complex): Complex {
  return { re: coefficient.re * point.re - coefficient.im * point.im,
    im: coefficient.re * point.im + coefficient.im * point.re };
}

export function polygonMotionAt(component: PolygonMotion, options: MotionOptions, time: number): Complex {
  validateOptions(options);
  validateComponent(component, options);
  if (!Number.isFinite(time)) throw Error("invalid-motion-time");
  const phase = component.direction * periodic(time) + component.phaseIndex / motionSampleCount;
  return transform(atomFor(component.shape, options).pointAt(phase), complexCoefficient(component));
}

function metrics(samples: Complex[], reconstruction: Complex[]) {
  let energy = 0;
  let maximum = 0;
  for (const [index, point] of samples.entries()) {
    const fitted = reconstruction[index];
    const squaredError = squaredNorm({ re: point.re - fitted.re, im: point.im - fitted.im });
    energy += squaredError;
    maximum = Math.max(maximum, squaredError);
  }
  return { rms: Math.sqrt(energy / motionSampleCount), max: Math.sqrt(maximum) };
}

function prepare(points: Complex[], options: MotionOptions): PolygonMotionResult {
  validateOptions(options);
  if (points.length < 3 || points.length > motionMaxPoints || points.some(({ re, im }) => !Number.isFinite(re) ||
    !Number.isFinite(im) || Math.abs(re) > 1 || Math.abs(im) > 1) ||
    new Set(points.map(({ re, im }) => `${re},${im}`)).size < 3) throw Error("invalid-contour");
  const samples = resampleContour(points, motionSampleCount, true);
  const center = sampleMean(samples);
  const reconstruction = samples.map(() => ({ ...center }));
  const errors = metrics(samples, reconstruction);
  return { center, samples, components: [], reconstruction, contributions: [], prefixRms: [errors.rms], ...errors };
}

function appendMotion(result: PolygonMotionResult, component: PolygonMotion, atom: MotionAtom): PolygonMotionResult {
  const coefficient = complexCoefficient(component);
  const { phaseIndex, direction } = component;
  // The fixed dyadic grid wraps both a positive and a reversed index.
  const contribution = atom.samples.map((_, index) => transform(atom.samples[(phaseIndex + direction * index) & sampleMask], coefficient));
  const reconstruction = result.reconstruction.map((point, index) => ({ re: point.re + contribution[index].re,
    im: point.im + contribution[index].im }));
  const errors = metrics(result.samples, reconstruction);
  return { ...result, ...errors, reconstruction, components: [...result.components, component],
    contributions: [...result.contributions, contribution], prefixRms: [...result.prefixRms, errors.rms] };
}

export function evaluatePolygonMotion(points: Complex[], options: MotionOptions, components: PolygonMotion[]): PolygonMotionResult {
  let result = prepare(points, options);
  if (components.length > options.count) throw Error("invalid-motion-component");
  for (const component of components) {
    validateComponent(component, options);
    result = appendMotion(result, { ...component }, atomFor(component.shape, options));
  }
  return result;
}

function bestProjection(residual: Complex[], atoms: MotionAtom[]) {
  let best: { atom: MotionAtom; component: PolygonMotion } | undefined;
  let bestPower = 0;
  for (const atom of atoms) {
    for (const direction of directions) {
      for (let phaseIndex = 0; phaseIndex < motionSampleCount; phaseIndex++) {
        let re = 0;
        let im = 0;
        for (let index = 0; index < motionSampleCount; index++) {
          const source = residual[index];
          const sample = atom.samples[(phaseIndex + direction * index) & sampleMask];
          re += source.re * sample.re + source.im * sample.im;
          im += source.im * sample.re - source.re * sample.im;
        }
        const power = re * re + im * im;
        // Rotated or shifted symmetric shapes can give the same projection.
        if (power <= bestPower * (1 + 32 * Number.EPSILON)) continue;
        bestPower = power;
        best = { atom, component: { shape: atom.shape, scale: Math.hypot(re, im) / motionSampleCount,
          angleDegrees: Math.atan2(im, re) * degreesPerRadian, phaseIndex, direction } };
      }
    }
  }
  return best;
}

export function fitPolygonMotion(points: Complex[], options: MotionOptions, prefix: PolygonMotion[] = []): PolygonMotionResult {
  let result = evaluatePolygonMotion(points, options, prefix);
  const shapes = options.family === "all" ? motionShapes : [options.family];
  const atoms = shapes.map(shape => atomFor(shape, options));
  for (let count = result.components.length; count < options.count && result.rms > residualFloor; count++) {
    const residual = result.samples.map((point, index) => ({ re: point.re - result.reconstruction[index].re,
      im: point.im - result.reconstruction[index].im }));
    const best = bestProjection(residual, atoms);
    if (!best || best.component.scale <= residualFloor) break;
    const next = appendMotion(result, best.component, best.atom);
    if (next.rms >= result.rms) break;
    result = next;
  }
  return result;
}
