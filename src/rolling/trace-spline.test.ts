import { describe, expect, it } from "vitest";
import type { Point2 } from "./lab-model";
import { fitRollingTrace } from "./trace-spline";

const sine = (n: number, amplitude = .36): Point2[] => Array.from({ length: n }, (_, i) => {
  const u = i / (n - 1);
  return [3 * u - 1.5, amplitude * Math.sin(4 * Math.PI * u)];
});

function endpoint(start: Point2, heading: number, segments: { length: number; sweep: number }[]) {
  let [x, y] = start;
  for (const { length, sweep } of segments) {
    const half = sweep / 2;
    const chord = length * (half === 0 ? 1 : Math.sin(half) / half);
    x += chord * Math.cos(heading + half);
    y += chord * Math.sin(heading + half);
    heading += sweep;
  }
  return { point: [x, y], heading };
}

describe("cubic trace and exact rolling arcs", () => {
  it("fits the 97-point two-period RED trace without dropping its lobes or endpoints", () => {
    const raw = sine(97);
    const fit = fitRollingTrace(raw);
    expect(fit.metrics).toMatchObject({ method: "cubic-biarc", closed: false, inputPoints: 97, tolerance: .035 });
    expect(fit.metrics.maxDeviation).toBeLessThanOrEqual(.035);
    expect(fit.metrics.length).toBeCloseTo(fit.metrics.sourceLength, 1);
    expect(fit.metrics.maxCurvature).toBeGreaterThan(3);
    expect(fit.metrics.maxCurvature).toBeLessThan(1.6 * .36 * (4 * Math.PI / 3) ** 2);
    expect(fit.segments.length).toBeLessThanOrEqual(256);
    expect(fit.segments.length).toBe(fit.metrics.arcCount);
    expect(fit.processed[0]).toEqual(raw[0]);
    const end = endpoint(fit.start, fit.heading, fit.segments).point;
    expect(end[0]).toBeCloseTo(raw.at(-1)![0], 10);
    expect(end[1]).toBeCloseTo(raw.at(-1)![1], 10);
    const y = fit.processed.map(point => point[1]);
    const tips = y.filter((value, i) => i > 0 && i < y.length - 1
      && ((value > .25 && value > y[i - 1] && value >= y[i + 1])
        || (value < -.25 && value < y[i - 1] && value <= y[i + 1])));
    expect(tips).toHaveLength(4);
    expect(fit.processed.every(([x], i) => !i || x > fit.processed[i - 1][0])).toBe(true);
  });

  it("closes a circle with the same tangent and bounded length/deviation", () => {
    const raw = Array.from({ length: 65 }, (_, i): Point2 => [Math.cos(i * Math.PI / 32), Math.sin(i * Math.PI / 32)]);
    raw[64] = raw[0];
    const fit = fitRollingTrace(raw, .018);
    const end = endpoint(fit.start, fit.heading, fit.segments);
    expect(fit.metrics.closed).toBe(true);
    expect(fit.metrics.seamAngle).toBeLessThan(1e-8);
    expect(end.point[0]).toBeCloseTo(1, 9);
    expect(end.point[1]).toBeCloseTo(0, 9);
    expect(end.heading - fit.heading).toBeCloseTo(2 * Math.PI, 9);
    expect(fit.metrics.length).toBeCloseTo(2 * Math.PI, 1);
    expect(fit.metrics.maxDeviation).toBeLessThanOrEqual(.018);
    for (const arc of fit.segments) expect(arc.sweep / arc.length).toBeCloseTo(1, 8);
  });

  it("de-duplicates a noisy nonuniform stroke without mutating it or introducing backtracking", () => {
    const raw: Point2[] = [[0, 0], [0, 0], [.0005, .0005], [.01, 0]];
    for (let i = 1; i < 60; i++) raw.push([.035 * i, .06 * Math.sin(i / 8) + .007 * Math.sin(i * 2.4)]);
    raw.push([2.1, 0]);
    const original = structuredClone(raw);
    const fit = fitRollingTrace(raw);
    expect(raw).toEqual(original);
    expect(fit.metrics.retainedPoints).toBeLessThan(raw.length);
    expect(fit.metrics.maxDeviation).toBeLessThanOrEqual(.035);
    expect(fit.processed.every(([x], i) => !i || x > fit.processed[i - 1][0])).toBe(true);
    expect(fit.processed.at(-1)![0]).toBeCloseTo(2.1, 10);
    expect(fit.processed.at(-1)![1]).toBeCloseTo(0, 10);
  });

  it("returns bounded diagnostics for backtracking, crossings, short input and exhausted budgets", () => {
    expect(() => fitRollingTrace([[0, 0], [.7, 0], [.2, 0], [1, 0]])).toThrow("TRACE_REVERSAL");
    expect(() => fitRollingTrace([[0, 0], [1, 1], [0, 1], [1, 0]])).toThrow("TRACE_SHAPE_ERROR");
    expect(() => fitRollingTrace([[0, 0], [.001, 0]])).toThrow("DEGENERATE_TRACE");
    expect(() => fitRollingTrace(sine(513))).toThrow("TRACE_BUDGET");
    expect(() => fitRollingTrace(sine(97), 1e-8)).toThrow("TRACE_BUDGET");
  });
});
