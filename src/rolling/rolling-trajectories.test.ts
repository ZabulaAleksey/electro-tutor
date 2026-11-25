import { describe, expect, it } from "vitest";
import baseline from "../../tests/fixtures/electrotutor-20261125-baseline.json";
import { solveRollingFeasibility } from "./feasibility.mjs";
import { prepareRollingTrack, type Point2, type RollingInput, type RollingMesh, type Vec3 } from "./lab-model";
import { verifyRollingReplay } from "./replay.mjs";
import { buildRollingMesh } from "./rolling-mesh";

function sample(count: number, at: (u: number) => Point2): Point2[] {
  return Array.from({ length: count }, (_, i) => at(i / (count - 1)));
}

function stroke(points: Point2[], radius = 1, quality: RollingInput["quality"] = "full"): RollingInput {
  return { trace: { kind: "stroke", points }, radius, quality };
}

const straight: Point2[] = [[-1, -.2], [1, -.2]];
const circleRadius = .7;
const arc = sample(37, u => [circleRadius * Math.sin(1.6 * u), circleRadius * (1 - Math.cos(1.6 * u))]);
const circle = sample(65, u => [circleRadius * Math.cos(2 * Math.PI * u), circleRadius * Math.sin(2 * Math.PI * u)]);
const ellipse = sample(89, u => [.78 * Math.cos(2 * Math.PI * u), .53 * Math.sin(2 * Math.PI * u)]);
const sBend = sample(65, u => [3 * u - 1.5, .43 * Math.sin(2 * Math.PI * u)]);
const twoCycle = sample(baseline.rollingSmoothTrace.points, u => [3 * u - 1.5, .36 * Math.sin(4 * Math.PI * u)]);
const threeCycle = sample(121, u => [3 * u - 1.5, .16 * Math.sin(6 * Math.PI * u)]);
const noisy = sBend.flatMap(([x, y], i): Point2[] => {
  const point: Point2 = [x, y + (i === 0 || i === sBend.length - 1 ? 0 : .008 * (-1) ** i)];
  return i % 7 ? [point] : [point, [...point]];
});

function distance(a: Point2, b: Point2) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function directedDeviation(source: Point2[], comparison: Point2[]) {
  return Math.max(...source.map(([x, y]) => {
    let nearest = Infinity;
    for (let i = 1; i < comparison.length; i++) {
      const [a, b] = comparison[i - 1];
      const dx = comparison[i][0] - a, dy = comparison[i][1] - b;
      const squaredLength = dx * dx + dy * dy;
      const t = squaredLength ? Math.max(0, Math.min(1, ((x - a) * dx + (y - b) * dy) / squaredLength)) : 0;
      nearest = Math.min(nearest, Math.hypot(x - a - t * dx, y - b - t * dy));
    }
    return nearest;
  }));
}

function integral(speed: (u: number) => number) {
  // Composite midpoint integration on [0, 1].
  const pieces = 16_384;
  let length = 0;
  for (let i = 0; i < pieces; i++) length += speed((i + .5) / pieces);
  return length / pieces;
}

function sinusoidLength(amplitude: number, cycles: number) {
  const omega = 2 * Math.PI * cycles;
  return integral(u => Math.hypot(3, amplitude * omega * Math.cos(omega * u)));
}

function polylineCurvature(points: Point2[]) {
  return points.slice(1, -1).map(([x, y], i) => {
    const [ax, ay] = points[i], [cx, cy] = points[i + 2];
    // Inverse circumradius of the triangle of three successive sampled poses.
    const signedAreaTwice = (x - ax) * (cy - y) - (y - ay) * (cx - x);
    return 2 * signedAreaTwice / (distance(points[i], [x, y]) * distance([x, y], points[i + 2]) * distance(points[i], points[i + 2]));
  });
}

function expectSinusoidLobes(target: Point2[], cycles: number, amplitude: number) {
  expect(target.slice(1).every(([x], i) => x > target[i][0])).toBe(true);
  for (let lobe = 0; lobe < 2 * cycles; lobe++) {
    const center = 3 * (lobe + .5) / (2 * cycles) - 1.5;
    const values = target.filter(([x]) => Math.abs(x - center) < .12).map(([, y]) => y * (-1) ** lobe);
    expect(Math.max(...values)).toBeGreaterThan(.83 * amplitude);
  }
}

function cross([a, b, c]: Vec3, [x, y, z]: Vec3): Vec3 {
  return [b * z - c * y, c * x - a * z, a * y - b * x];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function assertClosedHull(mesh: RollingMesh, radius: number) {
  const { vertices, triangles } = mesh;
  const vertexCount = vertices.length / 3;
  const faceCount = triangles.length / 3;
  const read = (i: number): Vec3 => [vertices[3 * i], vertices[3 * i + 1], vertices[3 * i + 2]];
  const edges = new Map<string, { count: number; balance: number }>();
  let volume = 0;
  expect(Number.isInteger(vertexCount) && Number.isInteger(faceCount)).toBe(true);
  expect(vertices.every(Number.isFinite)).toBe(true);
  for (let i = 0; i < triangles.length; i += 3) {
    const a = triangles[i], b = triangles[i + 1], c = triangles[i + 2];
    expect(Math.max(a, b, c)).toBeLessThan(vertexCount);
    const p = read(a), q = read(b), r = read(c);
    expect(dot(cross(subtract(q, p), subtract(r, p)), p)).toBeGreaterThan(0);
    volume += dot(p, cross(q, r)) / 6;
    for (const [from, to] of [[a, b], [b, c], [c, a]]) {
      const key = `${Math.min(from, to)}:${Math.max(from, to)}`;
      const value = edges.get(key) ?? { count: 0, balance: 0 };
      edges.set(key, { count: value.count + 1, balance: value.balance + Math.sign(to - from) });
    }
  }
  expect([...edges.values()].every(({ count, balance }) => count === 2 && balance === 0)).toBe(true);
  expect(vertexCount - edges.size + faceCount).toBe(2);
  expect(volume).toBeGreaterThan(.94 * (4 / 3) * Math.PI * radius ** 3);
  return volume;
}

function supportGap(vertices: Vec3[], radius: number, poses: ReturnType<typeof solveRollingFeasibility>["poses"]) {
  let gap = Infinity;
  for (const { orientation: [w, x, y, z] } of poses) {
    // Third row of the quaternion rotation matrix, negated, is downward in body coordinates.
    const downward: Vec3 = [2 * (w * y - x * z), -2 * (y * z + w * x), 2 * (x * x + y * y) - 1];
    for (const vertex of vertices) gap = Math.min(gap, radius - dot(vertex, downward));
  }
  return gap;
}

function measuredSlip(radius: number, poses: ReturnType<typeof solveRollingFeasibility>["poses"]) {
  let maxSlip = 0;
  for (let i = 1; i < poses.length; i++) {
    const before = poses[i - 1], after = poses[i];
    const ds = after.s - before.s;
    expect(ds).toBeGreaterThan(0);
    const [a, u, v, w] = before.orientation, [b, x, y, z] = after.orientation;
    const scalar = a * b + dot([u, v, w], [x, y, z]);
    const skew = cross([u, v, w], [x, y, z]);
    const relative: Vec3 = [a * x - b * u + skew[0], a * y - b * v + skew[1], a * z - b * w + skew[2]];
    const vectorNorm = Math.hypot(...relative);
    const angularSpeed = vectorNorm ? 2 * Math.atan2(vectorNorm, Math.abs(scalar)) / (ds * vectorNorm) : 0;
    const signedSpeed = scalar < 0 ? -angularSpeed : angularSpeed;
    // vpoint = vcenter + omega × (0, 0, -radius); arc length is a time parameter at unit speed.
    const [vx, vy] = subtract(after.localCenter, before.localCenter).map(value => value / ds);
    maxSlip = Math.max(maxSlip, Math.hypot(vx - radius * signedSpeed * relative[1], vy + radius * signedSpeed * relative[0]));
  }
  return maxSlip;
}

function checkedRun(points: Point2[], radius = 1) {
  const track = prepareRollingTrack(stroke(points, radius));
  const { shape, poses } = solveRollingFeasibility(track);
  const target = poses.map(pose => pose.target);
  const replay = verifyRollingReplay(shape, poses);
  const sourceDeviation = directedDeviation(points, target);
  const targetDeviation = directedDeviation(target, points);
  expect(shape.vertices.length).toBeGreaterThan(0);
  expect(poses[0].target).toEqual(points[0]);
  expect(distance(target.at(-1)!, points.at(-1)!)).toBeLessThan(1e-8);
  expect(sourceDeviation).toBeLessThan(.035);
  expect(targetDeviation).toBeLessThan(.035);
  expect(supportGap(shape.vertices, radius, poses)).toBeGreaterThanOrEqual(.02 * radius - 1e-10);
  expect(replay.minGapOverRadius).toBeGreaterThanOrEqual(-1e-10);
  expect(replay.maxTraceOverRadius).toBeLessThan(1e-3);
  expect(replay.maxSlipOverSpeed).toBeLessThan(1e-3);
  expect(measuredSlip(radius, poses)).toBeLessThan(1e-3);
  const length = poses.at(-1)!.s;
  if (track.traceMetrics) {
    const metrics = track.traceMetrics;
    expect(metrics.length).toBeCloseTo(length, 10);
    expect(metrics.maxDeviation).toBeLessThanOrEqual(metrics.tolerance);
    expect(poses).toHaveLength(1 + track.segmentSteps!.reduce((sum, count) => sum + count, 0));
    expect(poses.length).toBeLessThanOrEqual(4096);
  }
  return { track, shape, poses, target, replay, sourceDeviation, targetDeviation, length };
}

describe("EVAL-07 rolling trajectories", () => {
  it("processes the baseline two-cycle stroke and certifies non-spherical geometry", () => {
    const { length, target, track } = checkedRun(twoCycle, baseline.rollingSmoothTrace.radius);
    expect(track.traceMetrics?.method).toBe("cubic-biarc");
    expect(track.traceMetrics?.closed).toBe(false);
    expect(track.traceMetrics?.inputPoints).toBe(97);
    expect(new Set(track.segmentSteps).size).toBeGreaterThan(1);
    expect(Math.abs(length / sinusoidLength(.36, 2) - 1)).toBeLessThan(.025);
    expectSinusoidLobes(target, 2, .36);
  });

  it("processes a closed circle with a periodic seam", () => {
    const { length, target, track } = checkedRun(circle);
    expect(track.traceMetrics?.closed).toBe(true);
    expect(track.traceMetrics?.seamAngle).toBeLessThan(1e-7);
    expect(Math.abs(length / (2 * Math.PI * circleRadius) - 1)).toBeLessThan(.015);
    expect(distance(target.at(-1)!, target[0])).toBeLessThan(1e-8);
    expect(Math.max(...target.map(point => Math.abs(distance(point, [0, 0]) - circleRadius)))).toBeLessThan(.015);
    const winding = track.segments.reduce((sum, { sweep }) => sum + sweep, 0);
    expect(winding).toBeCloseTo(2 * Math.PI, 8);
    const seamCurvatures = polylineCurvature([target.at(-2)!, target[0], target[1]]);
    expect(Math.abs(seamCurvatures[0] * circleRadius - 1)).toBeLessThan(.18);
  });

  it("holds exact length and zero curvature for a straight stroke", () => {
    const { length, target } = checkedRun(straight);
    expect(length).toBeCloseTo(2, 12);
    expect(Math.max(...polylineCurvature(target).map(Math.abs))).toBeLessThan(1e-10);
  });

  it("keeps a general non-circular closed curve periodic without flattening it into a circle", () => {
    const { length, track, target } = checkedRun(ellipse);
    const period = 2 * Math.PI;
    const circumference = integral(u => period * Math.hypot(.78 * Math.sin(period * u), .53 * Math.cos(period * u)));
    expect(Math.abs(length / circumference - 1)).toBeLessThan(.02);
    expect(track.traceMetrics?.closed).toBe(true);
    expect(track.traceMetrics?.seamAngle).toBeLessThan(1e-7);
    expect(track.segments.reduce((total, segment) => total + segment.sweep, 0)).toBeCloseTo(period, 8);
    const xSize = Math.max(...target.map(([x]) => x)) - Math.min(...target.map(([x]) => x));
    const ySize = Math.max(...target.map(([, y]) => y)) - Math.min(...target.map(([, y]) => y));
    expect(Math.abs(xSize - 1.56)).toBeLessThan(.035);
    expect(Math.abs(ySize - 1.06)).toBeLessThan(.035);
  });

  it("recovers the signed curvature and length of an open circular arc", () => {
    const { length, target } = checkedRun(arc);
    const curvature = polylineCurvature(target);
    const meanCurvature = curvature.reduce((sum, value) => sum + value, 0) / curvature.length;
    expect(Math.abs(length / (1.6 * circleRadius) - 1)).toBeLessThan(.015);
    expect(Math.abs(meanCurvature * circleRadius - 1)).toBeLessThan(.12);
  });

  it.each([
    { name: "S bend", points: sBend, cycles: 1, amplitude: .43 },
    { name: "three-cycle curve", points: threeCycle, cycles: 3, amplitude: .16 },
  ])("retains both curvature signs and extrema for the $name", ({ points, cycles, amplitude }) => {
    const { length, target } = checkedRun(points);
    expect(Math.abs(length / sinusoidLength(amplitude, cycles) - 1)).toBeLessThan(.03);
    const curvature = polylineCurvature(target);
    expect(Math.max(...curvature)).toBeGreaterThan(.4);
    expect(Math.min(...curvature)).toBeLessThan(-.4);
    expectSinusoidLobes(target, cycles, amplitude);
  });

  it("denoises a deterministic hand stroke with duplicates and preserves the original input", () => {
    const before = structuredClone(noisy);
    const { length, target } = checkedRun(noisy);
    expect(noisy).toEqual(before);
    expect(Math.abs(length / sinusoidLength(.43, 1) - 1)).toBeLessThan(.02);
    expect(directedDeviation(target, sBend)).toBeLessThan(.02);
    expectSinusoidLobes(target, 1, .43);
  });

  it("constructs volumetrically distinct watertight bodies for the straight, arc, and S strokes", () => {
    const volumes = [straight, arc, sBend].map(points => {
      const { shape } = checkedRun(points);
      return assertClosedHull(buildRollingMesh(shape.radius, shape.vertices, "full"), shape.radius);
    });
    expect(Math.abs(volumes[0] - volumes[1])).toBeGreaterThan(.015);
    expect(Math.abs(volumes[1] - volumes[2])).toBeGreaterThan(.015);
    expect(Math.abs(volumes[0] - volumes[2])).toBeGreaterThan(.015);
  });

  it("converges under replay refinement while keeping the continuous support geometry", () => {
    const track = prepareRollingTrack(stroke(arc));
    const steps = track.segments.map(({ length, sweep }) => Math.max(2, Math.ceil((length / track.radius + Math.abs(sweep)) / .13)));
    const coarse = solveRollingFeasibility({ ...track, stepsPerSegment: undefined, segmentSteps: steps });
    const fine = solveRollingFeasibility({ ...track, stepsPerSegment: undefined, segmentSteps: steps.map(count => 4 * count) });
    const low = verifyRollingReplay(coarse.shape, coarse.poses);
    const high = verifyRollingReplay(fine.shape, fine.poses);
    expect(fine.shape).toEqual(coarse.shape);
    expect(fine.poses.at(-1)).toEqual(coarse.poses.at(-1));
    expect(high.maxTraceOverRadius).toBeLessThan(.15 * low.maxTraceOverRadius);
    expect(high.maxSlipOverSpeed).toBeLessThan(.15 * low.maxSlipOverSpeed);
  });

  it("diagnoses short, invalid and physically uncertifiable cases", () => {
    expect(() => prepareRollingTrack(stroke([[0, 0], [.015, 0], [.015, 0]]))).toThrow("DEGENERATE_TRACE");
    expect(() => prepareRollingTrack(stroke([[0, 0], [0, Number.NaN]]))).toThrow("INVALID_INPUT");
    expect(() => prepareRollingTrack(stroke([[-.8, -.8], [.8, .8], [-.8, .8], [.8, -.8]]))).toThrow("TRACE_SHAPE_ERROR");
    const meridian = { length: 2 * Math.PI, sweep: 0 };
    const changeDirection = { length: 1e-4, sweep: Math.PI / 4 };
    const fourMeridians = [meridian, changeDirection, meridian, changeDirection, meridian, changeDirection, meridian];
    expect(() => solveRollingFeasibility({ radius: 1, start: [0, 0], heading: 0, segments: fourMeridians, stepsPerSegment: 48 }))
      .toThrow("NO_CERTIFIED_SHAPE");
  });
});
