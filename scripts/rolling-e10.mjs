import assert from "node:assert/strict";
import { solveRollingFeasibility } from "../src/rolling/feasibility.mjs";
import { verifyRollingReplay } from "../src/rolling/replay.mjs";

const refinements = [24, 48, 96];
const circleLength = Math.PI / Math.SQRT2;
const unitTrack = { radius: 1, start: [0, 0], heading: 0, stepsPerSegment: 96 };
const circleTrace = { ...unitTrack, segments: [{ length: circleLength, sweep: circleLength }] };

function measure(shape, poses) {
  const { contacts, ...metrics } = verifyRollingReplay(shape, poses);
  assert.equal(contacts.length, poses.length);
  return { steps: poses.length - 1, ...metrics };
}

function sphereDerivative(t, [w, x, y, z]) {
  // x(t)=t, y(t)=0.25 sin(2t); q' = (0, normal × p') q / 2 for radius 1.
  const wx = -0.5 * Math.cos(2 * t), wy = 1;
  return [-(wx * x + wy * y) / 2, (wx * w + wy * z) / 2, (wy * w - wx * z) / 2, (wx * y - wy * x) / 2];
}

function sphereReference(steps) {
  const h = 1.5 / steps;
  const offset = (q, d, step) => q.map((value, axis) => value + step * d[axis]);
  const speed = t => Math.hypot(1, 0.5 * Math.cos(2 * t));
  let orientation = [1, 0, 0, 0];
  let s = 0;
  const poses = [];
  for (let i = 0; i <= steps; i++) {
    const t = i * h;
    const target = [t, 0.25 * Math.sin(2 * t)];
    const center = [...target, 1];
    poses.push({ s, center, localCenter: center, orientation, target });
    if (i === steps) break;
    const k1 = sphereDerivative(t, orientation);
    const k2 = sphereDerivative(t + h / 2, offset(orientation, k1, h / 2));
    const k3 = sphereDerivative(t + h / 2, offset(orientation, k2, h / 2));
    const k4 = sphereDerivative(t + h, offset(orientation, k3, h));
    const next = orientation.map((value, axis) => value + h * (k1[axis] + 2 * k2[axis] + 2 * k3[axis] + k4[axis]) / 6);
    const norm = Math.hypot(...next);
    orientation = next.map(value => value / norm);
    s += h * (speed(t) + 4 * speed(t + h / 2) + speed(t + h)) / 6;
  }
  return measure({ radius: 1, vertices: [] }, poses);
}

function axialDistance(vertices, axis, sign) {
  const point = vertices.find(vertex => sign * vertex[axis] > 0
    && vertex.every((value, index) => index === axis || Math.abs(value) < 1e-12));
  return point ? Math.abs(point[axis]) : null;
}

function inverseReference(steps) {
  const input = { ...circleTrace, stepsPerSegment: steps };
  const { shape, poses } = solveRollingFeasibility(input);
  const reflected = solveRollingFeasibility({ ...input, segments: [{ length: circleLength, sweep: -circleLength }] });
  const xGenerator = axialDistance(shape.vertices, 0, 1);
  assert.ok(Math.abs(xGenerator - 0.98 * Math.SQRT2) < 1e-12);
  assert.equal(axialDistance(shape.vertices, 1, 1), null);
  assert.equal(axialDistance(reflected.shape.vertices, 1, 1), 1.6);
  assert.ok(shape.clearanceLowerBound >= 0.02 - 1e-12);
  assert.ok(reflected.shape.clearanceLowerBound >= 0.02 - 1e-12);
  assert.throws(() => verifyRollingReplay(reflected.shape, poses), { message: "CONTACT_NOT_CERTIFIED" });
  const analyticTrackError = Math.max(...poses.map(({ target, s }) =>
    Math.hypot(target[0] - Math.sin(s), target[1] - (1 - Math.cos(s)))));
  assert.ok(analyticTrackError < 1e-12);
  return {
    ...measure(shape, poses), exteriorVertices: shape.vertices.length,
    certifiedExteriorGapOverRadius: shape.clearanceLowerBound / shape.radius,
    xGenerator, reflectedYGenerator: 1.6, analyticTrackError,
  };
}

function requireConvergence(rows) {
  for (const row of rows) assert.ok(row.minGapOverRadius >= -1e-10);
  for (const key of ["maxSlipOverSpeed", "maxTraceOverRadius"]) {
    assert.ok(rows.at(-1)[key] < 1e-3, key);
    for (let index = 1; index < rows.length; index++) {
      assert.ok(rows[index][key] * 3 < rows[index - 1][key], key);
    }
  }
}

function rejected(input, code) {
  assert.throws(() => solveRollingFeasibility(input), { message: code });
  return code;
}

export function runRollingE10() {
  const sphere = refinements.map(sphereReference);
  const inverse = refinements.map(inverseReference);
  requireConvergence(sphere);
  requireConvergence(inverse);
  const uncertified = [{ length: 2 * Math.PI, sweep: 0 }];
  for (let turn = 0; turn < 3; turn++) {
    uncertified.push({ length: 1e-5, sweep: Math.PI / 4 }, { length: 2 * Math.PI, sweep: 0 });
  }
  const diagnostics = [
    rejected({ ...unitTrack, segments: [{ length: 0, sweep: 0 }] }, "DEGENERATE_TRACE"),
    rejected({ ...unitTrack, segments: [{ length: 1, sweep: "0" }] }, "INVALID_INPUT"),
    rejected({ ...unitTrack, segments: [{ length: 200, sweep: 1 }] }, "BUDGET_EXCEEDED"),
    rejected({ ...unitTrack, segments: uncertified }, "NO_CERTIFIED_SHAPE"),
    "CONTACT_NOT_CERTIFIED",
  ];
  assert.deepEqual(solveRollingFeasibility(circleTrace), solveRollingFeasibility(circleTrace));
  assert.deepEqual(solveRollingFeasibility({ ...circleTrace, stepsPerSegment: 9 }).shape, solveRollingFeasibility(circleTrace).shape);
  return { schemaVersion: 1, verdict: "PASS", sphere, inverse, diagnostics, deterministic: true };
}
