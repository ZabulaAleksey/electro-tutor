import { describe, expect, it } from "vitest";
import { maxArcProjection, solveRollingFeasibility } from "./feasibility.mjs";

const curvature = 0.5;
const frequency = Math.hypot(1, curvature);
const arcLength = Math.PI / frequency;
const circularTrace = {
  radius: 1,
  start: [0, 0],
  heading: 0,
  segments: [{ length: arcLength, sweep: arcLength * curvature }],
  stepsPerSegment: 16,
};

function axialVertex(vertices, axis, sign = 1) {
  return vertices.find(vertex => sign * vertex[axis] > 0
    && vertex.every((coordinate, index) => index === axis || Math.abs(coordinate) < 1e-12));
}

function expectPoint(value, oracle, precision = 11) {
  expect(value).toHaveLength(oracle.length);
  value.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(oracle[index], precision));
}

function circleNormal(s) {
  // Rodrigues about (0,-1,k) through angle hypot(1,k)*s from (0,0,-1).
  const x = Math.sin(frequency * s) / frequency;
  const y = curvature * (1 - Math.cos(frequency * s)) / frequency ** 2;
  const z = -(curvature ** 2 + Math.cos(frequency * s)) / frequency ** 2;
  return [x, y, z];
}

function circleOrientation(s) {
  const azimuth = curvature * s / 2;
  const phase = frequency * s / 2;
  const cosYaw = Math.cos(azimuth), sinYaw = Math.sin(azimuth);
  const cosPhase = Math.cos(phase), localY = Math.sin(phase) / frequency;
  const localZ = -curvature * localY;
  return [
    cosYaw * cosPhase - sinYaw * localZ,
    -sinYaw * localY,
    cosYaw * localY,
    sinYaw * cosPhase + cosYaw * localZ,
  ];
}

describe("E10 continuous contact geometry", () => {
  it("finds an interior maximum, including arcs that cross a full turn", () => {
    const x = [1, 0, 0], y = [0, 1, 0], z = [0, 0, 1];
    expect(maxArcProjection(y, z, x, Math.PI)).toBeCloseTo(1, 13);
    expect(maxArcProjection(x, z, y, 0.25)).toBeCloseTo(0, 13);
    expect(maxArcProjection(x, z, y, 2 * Math.PI + 0.25)).toBeCloseTo(1, 13);
    expect(maxArcProjection(x, z, y, 0)).toBeCloseTo(0, 13);
  });

  it("recovers a nonspherical body with independent circular-arc support bounds", () => {
    const { shape, poses } = solveRollingFeasibility(circularTrace);
    const maxXProjection = 1 / frequency; // attained inside the arc
    const maxYProjection = 2 * curvature / frequency ** 2; // attained at the end
    expectPoint(axialVertex(shape.vertices, 0), [0.98 / maxXProjection, 0, 0]);
    expectPoint(axialVertex(shape.vertices, 1), [0, 0.98 / maxYProjection, 0]);
    expectPoint(axialVertex(shape.vertices, 1, -1), [0, -1.6, 0]);
    expect(shape.clearanceLowerBound).toBeGreaterThanOrEqual(0.02 - 1e-12);
    expect(poses).toHaveLength(17);
    for (const { s, orientation: [w, x, y, z], target, center } of poses) {
      expect(Math.hypot(w, x, y, z)).toBeCloseTo(1, 13);
      expectPoint([w, x, y, z].map(value => w < 0 ? -value : value), circleOrientation(s));
      expectPoint([-2 * (x * z - w * y), -2 * (y * z + w * x), 2 * (x * x + y * y) - 1], circleNormal(s));
      const xy = [Math.sin(curvature * s) / curvature, (1 - Math.cos(curvature * s)) / curvature];
      expectPoint(target, xy);
      expectPoint(center, [...xy, 1]);
    }
  });

  it("selects different body geometry for the reflected trace and does not fit only sampled poses", () => {
    const low = solveRollingFeasibility({ ...circularTrace, stepsPerSegment: 9 });
    const dense = solveRollingFeasibility({ ...circularTrace, stepsPerSegment: 65 });
    expect(dense.shape).toEqual(low.shape);
    const mirrored = solveRollingFeasibility({
      ...circularTrace,
      segments: [{ length: arcLength, sweep: -arcLength * curvature }],
    });
    expectPoint(axialVertex(mirrored.shape.vertices, 1), [0, 1.6, 0]);
    expectPoint(axialVertex(mirrored.shape.vertices, 1, -1), [0, -0.98 * frequency ** 2 / (2 * curvature), 0]);
  });

  it("joins tangent primitives once at the same center and orientation", () => {
    const piecewise = solveRollingFeasibility({
      ...circularTrace,
      segments: [...circularTrace.segments, { length: 0.75, sweep: 0 }],
    });
    const first = solveRollingFeasibility(circularTrace).poses;
    expect(piecewise.poses).toHaveLength(33);
    expect(piecewise.poses.slice(0, 17)).toEqual(first);
    const last = first.at(-1);
    const finalHeading = arcLength * curvature;
    expectPoint(piecewise.poses.at(-1).target, [
      last.target[0] + 0.75 * Math.cos(finalHeading),
      last.target[1] + 0.75 * Math.sin(finalHeading),
    ]);
  });

  it("preserves geometry and pose orientation under changes of length unit", () => {
    const cases = [
      solveRollingFeasibility(circularTrace),
      solveRollingFeasibility({
        ...circularTrace,
        radius: 2,
        segments: [{ length: 2 * arcLength, sweep: arcLength * curvature }],
      }),
    ];
    expect(cases[1].shape.vertices).toHaveLength(cases[0].shape.vertices.length);
    cases[1].shape.vertices.forEach((vertex, index) => expectPoint(vertex, cases[0].shape.vertices[index].map(x => 2 * x)));
    cases[1].poses.forEach((pose, index) => {
      expectPoint(pose.orientation, cases[0].poses[index].orientation);
      expectPoint(pose.target, cases[0].poses[index].target.map(x => 2 * x));
    });
  });

  it("returns deterministic geometry and poses for equal inputs", () => {
    const decoded = JSON.parse(JSON.stringify(circularTrace));
    expect(solveRollingFeasibility(decoded)).toEqual(solveRollingFeasibility(circularTrace));
  });

  it("rejects zero-length, nonfinite and out-of-budget input diagnostically", () => {
    expect(() => solveRollingFeasibility({ ...circularTrace, segments: [{ length: 0, sweep: 0 }] })).toThrow("DEGENERATE_TRACE");
    expect(() => solveRollingFeasibility({ ...circularTrace, segments: [{ length: 1e-8, sweep: 0 }] })).toThrow("DEGENERATE_TRACE");
    expect(() => solveRollingFeasibility({ ...circularTrace, heading: Number.NaN })).toThrow("INVALID_INPUT");
    expect(() => solveRollingFeasibility({ ...circularTrace, segments: [{ length: 201, sweep: 0 }] })).toThrow("BUDGET_EXCEEDED");
    expect(() => solveRollingFeasibility({ ...circularTrace, segments: [{ length: 9, sweep: 0 }] })).toThrow("BUDGET_EXCEEDED");
  });

  it("refuses to replace an uncertifiable nonspherical body with a sphere", () => {
    // A full straight roll traces a complete meridian. The short turns change
    // travel direction while keeping accumulated body rotation close to identity.
    const line = { length: 2 * Math.PI, sweep: 0 };
    const turn = { length: 1e-4, sweep: Math.PI / 4 };
    expect(() => solveRollingFeasibility({
      ...circularTrace,
      segments: [line, turn, line, turn, line, turn, line],
    })).toThrow("NO_CERTIFIED_SHAPE");
  });
});
