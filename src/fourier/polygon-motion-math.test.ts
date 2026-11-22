import { describe, expect, it } from "vitest";
import type { Complex } from "./math";
import { defaultMotionOptions, motionFixtureSeed, motionSampleCount, type MotionOptions,
  type MotionShape, type PolygonMotion } from "./polygon-motion-contract";
import { evaluatePolygonMotion, fitPolygonMotion, polygonMotionAt } from "./polygon-motion-math";

const square = [{ re: 1, im: 1 }, { re: -1, im: 1 }, { re: -1, im: -1 }, { re: 1, im: -1 }];
const squareRms = Math.sqrt(4 / 3 + 2 / (3 * 32 ** 2));
const options = (family: MotionOptions["family"], count = 4): MotionOptions => ({ ...defaultMotionOptions, family, count });

function pointsOnCircle(sides: number, radius: number, initialAngle: number): Complex[] {
  return Array.from({ length: sides }, (_, index) => {
    const angle = initialAngle + index * (2 * Math.PI / sides);
    return { re: radius * Math.cos(angle), im: radius * Math.sin(angle) };
  });
}

function seededStar(seed: number) {
  let state = seed;
  return Array.from({ length: 10 }, (_, index) => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const jitter = (state >>> 0) / 0x1_0000_0000;
    const radius = (index % 2 ? .37 : .90) + .08 * jitter;
    const angle = Math.PI / 2 + index * Math.PI / 5;
    return { re: radius * Math.cos(angle), im: radius * Math.sin(angle) };
  });
}

describe("numerical F preflight (E9)", () => {
  it("finds one exact square in the entire dictionary", () => {
    const result = fitPolygonMotion(square, options("all"));
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({ shape: "square", phaseIndex: 0, direction: 1 });
    expect(result.components[0].scale).toBeCloseTo(squareRms, 12);
    expect(result.prefixRms[0]).toBeCloseTo(squareRms, 12);
    expect(result.samples).toHaveLength(128);
    expect(result.rms).toBeLessThan(1e-12);
    expect(result.max).toBeLessThan(1e-12);
  });

  it("finds a clockwise square without reordering its input points", () => {
    const reversed = [square[0], ...square.slice(1).reverse()];
    const result = fitPolygonMotion(reversed, options("square"));
    expect(result.components[0]).toMatchObject({ phaseIndex: 0, direction: -1 });
    expect(result.samples[1].re).toBe(1);
    expect(result.samples[1].im).toBeLessThan(1);
    expect(result.max).toBeLessThan(1e-12);
  });

  it("recovers the angle, scale, center and arc phase of a transformed square", () => {
    const angle = 32 * Math.PI / 180;
    const multiplier = .4;
    const shifted = [{ re: .5, im: 1 }, ...square.slice(1), square[0]];
    const points = shifted.map(({ re, im }) => ({ re: .12 + multiplier * (Math.cos(angle) * re - Math.sin(angle) * im),
      im: -.2 + multiplier * (Math.sin(angle) * re + Math.cos(angle) * im) }));
    const result = fitPolygonMotion(points, options("square"));
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({ phaseIndex: 8, direction: 1 });
    expect(result.components[0].angleDegrees).toBeCloseTo(32, 11);
    expect(result.components[0].scale).toBeCloseTo(multiplier * squareRms, 12);
    expect(result.center.re).toBeCloseTo(.12, 13);
    expect(result.center.im).toBeCloseTo(-.2, 13);
    expect(result.max).toBeLessThan(1e-12);
  });

  it("reconstructs a stepped traversal of a uniform circle with a single continuous circle", () => {
    const result = fitPolygonMotion(pointsOnCircle(motionSampleCount, .65, 0), options("all"));
    expect(result.components).toHaveLength(1);
    expect(result.components[0]).toMatchObject({ shape: "circle", direction: 1, phaseIndex: 0 });
    expect(result.components[0].scale).toBeCloseTo(.65, 12);
    expect(result.max).toBeLessThan(1e-12);
    const point = polygonMotionAt(result.components[0], options("all"), .25);
    expect(point.re).toBeCloseTo(0, 12);
    expect(point.im).toBeCloseTo(.65, 12);
  });

  it.each([
    ["triangle", pointsOnCircle(3, .75, Math.PI / 2)],
    ["polygon", pointsOnCircle(7, .74, Math.PI / 2)],
    ["rectangle", [{ re: -.8, im: -.4 }, { re: .8, im: -.4 }, { re: .8, im: .4 }, { re: -.8, im: .4 }]],
  ] satisfies [MotionShape, Complex[]][])("fits the chosen %s edge traversal", (family, points) => {
    const settings = { ...options(family), sides: 7, aspect: 2 };
    const result = fitPolygonMotion(points, settings);
    expect(result.components).toHaveLength(1);
    expect(result.components[0].shape).toBe(family);
    expect(result.rms).toBeLessThan(1e-12);
  });

  it("reduces sampled RMS monotonically with deterministic phases on the seeded star", () => {
    const star = seededStar(motionFixtureSeed);
    const budget = options("all", 12);
    const result = fitPolygonMotion(star, budget);
    expect(result.components).toHaveLength(12);
    expect(result.max).toBeGreaterThanOrEqual(result.rms);
    for (const [index, rms] of result.prefixRms.slice(1).entries()) expect(rms).toBeLessThan(result.prefixRms[index]);
    expect(fitPolygonMotion(star, budget)).toEqual(result);
    expect(fitPolygonMotion(star, { ...budget, count: 3 }).components).toEqual(result.components.slice(0, 3));
    expect(evaluatePolygonMotion(star, budget, result.components)).toEqual(result);
  });

  it("evaluates between discrete nodes along the square's actual edges and repeats periodically", () => {
    const candidate: PolygonMotion = { shape: "square", scale: squareRms / 2, angleDegrees: 0, phaseIndex: 0, direction: 1 };
    const point = polygonMotionAt(candidate, options("square"), 33 / 256);
    expect(point.re).toBeCloseTo(-1 / 64, 12);
    expect(point.im).toBeCloseTo(.5, 12);
    expect(polygonMotionAt(candidate, options("square"), 33 / 256 - 1)).toEqual(point);
    const reverse = { ...candidate, direction: -1 as const };
    expect(polygonMotionAt(reverse, options("square"), .125)).toEqual({ re: .5, im: 0 });
  });

  it("recomputes manual scale and rotation on the same sampling grid", () => {
    const half: PolygonMotion = { shape: "square", scale: squareRms / 2, angleDegrees: 90, phaseIndex: 32, direction: 1 };
    const result = evaluatePolygonMotion(square, options("square"), [half]);
    // The phase shift and spatial rotation each add a quarter turn.
    expect(result.reconstruction[0].re).toBeCloseTo(-.5, 12);
    expect(result.reconstruction[0].im).toBeCloseTo(-.5, 12);
    expect(result.rms).toBeCloseTo(1.5 * squareRms, 12);
    expect(result.max).toBeCloseTo(1.5 * Math.SQRT2, 12);
    expect(result.rms).toBeGreaterThan(result.prefixRms[0]);
    for (const [index, sample] of result.contributions[0].entries()) {
      expect(polygonMotionAt(half, options("square"), index / motionSampleCount)).toEqual(sample);
    }
  });

  it("leaves a manually edited prefix in place and fits its remaining residual", () => {
    const star = seededStar(motionFixtureSeed);
    const settings = options("all", 4);
    const fitted = fitPolygonMotion(star, settings);
    const manual = { ...fitted.components[0], scale: fitted.components[0].scale / 2, phaseIndex: 32 };
    const baseline = evaluatePolygonMotion(star, settings, [manual]);
    const continued = fitPolygonMotion(star, settings, [manual]);

    expect(continued.components).toHaveLength(4);
    expect(continued.components[0]).toEqual(manual);
    expect(continued.prefixRms[1]).toEqual(baseline.rms);
    expect(continued.rms).toBeLessThan(baseline.rms);
    for (const [index, rms] of continued.prefixRms.slice(2).entries()) {
      expect(rms).toBeLessThanOrEqual(continued.prefixRms[index + 1]);
    }
    expect(continued.components.slice(1)).not.toEqual(fitted.components.slice(1));
    expect(evaluatePolygonMotion(star, settings, continued.components)).toEqual(continued);
    expect(fitPolygonMotion(star, settings, [])).toEqual(fitted);
  });

  it("rejects non-finite, degenerate or out-of-range contour and component inputs", () => {
    const settings = options("square");
    expect(() => fitPolygonMotion([square[0], square[0], square[1]], settings)).toThrow("invalid-contour");
    expect(() => fitPolygonMotion([...square, { re: 2, im: 0 }], settings)).toThrow("invalid-contour");
    expect(() => fitPolygonMotion([...square, { re: NaN, im: 0 }], settings)).toThrow("invalid-contour");
    expect(() => fitPolygonMotion(square, { ...settings, count: 0 })).toThrow("invalid-motion-options");
    expect(() => evaluatePolygonMotion(square, settings, [{ shape: "circle", scale: .5, direction: 1,
      phaseIndex: 0, angleDegrees: 0 }])).toThrow("invalid-motion-component");
  });
});
