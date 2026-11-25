import { describe, expect, it } from "vitest";
import { solveRollingFeasibility } from "./feasibility.mjs";
import { verifyRollingReplay } from "./replay.mjs";

const mixed = {
  radius: 1, start: [2, -1], heading: .2,
  segments: [
    { length: .75, sweep: 0 }, { length: 1.15, sweep: .48 }, { length: .24, sweep: 0 },
    { length: .73, sweep: -.39 }, { length: 1.02, sweep: -.37 }, { length: .6, sweep: 0 },
    { length: .7, sweep: .41 },
  ],
  segmentSteps: [15, 34, 5, 24, 35, 12, 24],
};

function independentStep([w, x, y, z], tangent, radius) {
  // q' = (0, (up × tangent) / R) q / 2 in world coordinates.
  const rx = -Math.sin(tangent) / radius, ry = Math.cos(tangent) / radius;
  return [-(rx * x + ry * y) / 2, (rx * w + ry * z) / 2, (ry * w - rx * z) / 2, (rx * y - ry * x) / 2];
}

function integrateStep(input, q, direction, curvature, length) {
  const advance = (state, derivative, step) => state.map((value, i) => value + step * derivative[i]);
  const steps = Math.max(1, Math.ceil(length * (1 / input.radius + Math.abs(curvature)) / .001));
  const ds = length / steps;
  for (let i = 0; i < steps; i++) {
    const heading = direction + curvature * i * ds;
    const a = independentStep(q, heading, input.radius);
    const b = independentStep(advance(q, a, ds / 2), heading + curvature * ds / 2, input.radius);
    const c = independentStep(advance(q, b, ds / 2), heading + curvature * ds / 2, input.radius);
    const d = independentStep(advance(q, c, ds), heading + curvature * ds, input.radius);
    q = q.map((value, index) => value + ds * (a[index] + 2 * b[index] + 2 * c[index] + d[index]) / 6);
    const norm = Math.hypot(...q);
    q = q.map(value => value / norm);
  }
  return q;
}

function assertArcJoints(input, rolling) {
  let heading = input.heading;
  let coordinate = [...input.start];
  let q = [1, 0, 0, 0], offset = 0, arcLength = 0;
  for (const [index, { length, sweep }] of input.segments.entries()) {
    const curvature = sweep / length;
    const localX = sweep ? Math.sin(sweep) / curvature : length;
    const localY = sweep ? (1 - Math.cos(sweep)) / curvature : 0;
    coordinate = [
      coordinate[0] + Math.cos(heading) * localX - Math.sin(heading) * localY,
      coordinate[1] + Math.sin(heading) * localX + Math.cos(heading) * localY,
    ];
    q = integrateStep(input, q, heading, curvature, length);
    heading += sweep;
    arcLength += length;
    offset += input.segmentSteps[index];

    const pose = rolling.poses[offset];
    expect(pose.s).toBeCloseTo(arcLength, 12);
    expect(pose.target[0]).toBeCloseTo(coordinate[0], 11);
    expect(pose.target[1]).toBeCloseTo(coordinate[1], 11);
    const sign = q.reduce((sum, value, k) => sum + value * pose.orientation[k], 0) < 0 ? -1 : 1;
    const error = Math.hypot(...q.map((value, k) => value - sign * pose.orientation[k]));
    expect(error).toBeLessThan(1e-10);
  }
  expect(rolling.poses).toHaveLength(offset + 1);
  expect(rolling.poses.slice(1).every((pose, i) => pose.s > rolling.poses[i].s)).toBe(true);
}

describe("adaptive inverse rolling of circular-arc chains", () => {
  it("keeps independently integrated poses and a sample-independent supporting body", () => {
    const coarse = solveRollingFeasibility(mixed);
    const refinedInput = { ...mixed, segmentSteps: mixed.segmentSteps.map(count => count * 2) };
    const fine = solveRollingFeasibility(refinedInput);
    assertArcJoints(mixed, coarse);
    assertArcJoints(refinedInput, fine);
    expect(coarse.shape).toEqual(fine.shape);
    expect(coarse.shape.vertices.length).toBeGreaterThan(0);
    expect(fine.shape.clearanceLowerBound / mixed.radius).toBeGreaterThanOrEqual(.02 - 1e-12);

    const measured = verifyRollingReplay(coarse.shape, coarse.poses);
    const refined = verifyRollingReplay(fine.shape, fine.poses);
    expect(refined.minGapOverRadius).toBeGreaterThanOrEqual(-1e-12);
    expect(refined.minSampledExteriorGapOverRadius).toBeGreaterThanOrEqual(.02 - 1e-12);
    for (const metric of ["maxSlipOverSpeed", "maxTraceOverRadius"]) {
      expect(refined[metric]).toBeLessThan(.001);
      expect(refined[metric]).toBeLessThan(measured[metric] / 3);
    }
  });

  it("accepts the complete supported 256-arc trace without truncation", () => {
    const segments = Array.from({ length: 256 }, (_, i) => ({ length: .008 + .0006 * (i % 5), sweep: i % 2 ? .006 : -.006 }));
    const segmentSteps = segments.map((_, i) => 1 + i % 5);
    const input = { radius: 1, start: [0, 0], heading: 0, segments, segmentSteps };
    const rolling = solveRollingFeasibility(input);
    assertArcJoints(input, rolling);
    const measured = verifyRollingReplay(rolling.shape, rolling.poses);
    expect(measured.maxSlipOverSpeed).toBeLessThan(1e-5);
    expect(measured.maxTraceOverRadius).toBeLessThan(1e-5);
    expect(measured.contacts).toHaveLength(rolling.poses.length);
    expect(() => solveRollingFeasibility({ ...input, segments: [...segments, segments[0]], segmentSteps: [...segmentSteps, 1] }))
      .toThrow("BUDGET_EXCEEDED");
  });

  it("bounds each arc's resolution and the total count before generating poses", () => {
    const segments = Array.from({ length: 4 }, () => ({ length: .25, sweep: 0 }));
    const input = { radius: 1, start: [0, 0], heading: 0, segments };
    expect(solveRollingFeasibility({ ...input, segmentSteps: [1024, 1024, 1024, 1023] }).poses).toHaveLength(4096);
    expect(() => solveRollingFeasibility({ ...input, segmentSteps: [1024, 1024, 1024, 1024] })).toThrow("BUDGET_EXCEEDED");
    expect(() => solveRollingFeasibility({ ...input, segmentSteps: [1025, 1, 1, 1] })).toThrow("BUDGET_EXCEEDED");
    expect(() => solveRollingFeasibility({ ...input, segmentSteps: [1, 1, 0, 1] })).toThrow("BUDGET_EXCEEDED");
    expect(() => solveRollingFeasibility({ ...mixed, segmentSteps: mixed.segments.map(() => 1) })).toThrow("BUDGET_EXCEEDED");
    expect(() => solveRollingFeasibility({ ...input, segmentSteps: [1, 1, 1] })).toThrow("INVALID_INPUT");
    expect(() => solveRollingFeasibility({ ...input, segmentSteps: [1, 1, 1, 1.5] })).toThrow("INVALID_INPUT");
    expect(() => solveRollingFeasibility({ ...input, stepsPerSegment: 8, segmentSteps: [1, 1, 1, 1] })).toThrow("INVALID_INPUT");
  });
});
