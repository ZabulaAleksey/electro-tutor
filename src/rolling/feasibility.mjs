import { conjugate, maxArcProjection, multiply, normalizedQuaternion, quaternionAround, rotateVector, scale } from "./geometry.mjs";

export { maxArcProjection };

/** @typedef {import("./geometry.mjs").Vector3} Vector3 */
/** @typedef {import("./geometry.mjs").Quaternion} Quaternion */
/** @typedef {[number, number]} Point2 */
/** @typedef {{length: number, sweep: number}} Segment */
/** @typedef {{radius: number, start: Point2, heading: number, segments: Segment[], stepsPerSegment: number}} RollingInput */
/** @typedef {{s: number, center: Vector3, localCenter: Vector3, orientation: Quaternion, target: Point2}} Pose */

/** @type {Vector3} */
const up = [0, 0, 1];
/** @type {Vector3} */
const down = [0, 0, -1];
const minRelativeLength = 1e-6;
const maxRelativeLength = 1000;
const maxAngleBudget = 200;
const maxSampleRotation = 0.5;
const maxExtent = 1.6;
const extraVertexMargin = 0.02;
const roundoffGuard = 64 * Number.EPSILON;

/** @returns {Vector3[]} */
function probeDirections() {
  /** @type {Vector3[]} */
  const directions = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const x of [-1, 0, 1]) {
    for (const y of [-1, 0, 1]) {
      for (const z of [-1, 0, 1]) {
        const norm = Math.hypot(x, y, z);
        if (norm > 1) directions.push(scale([x, y, z], 1 / norm));
      }
    }
  }
  return directions;
}

const directions = probeDirections();

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is number} */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** @param {unknown} input @returns {RollingInput} */
function validatedInput(input) {
  if (!record(input)) throw Error("INVALID_INPUT");
  const { radius, start, heading, segments, stepsPerSegment } = input;
  if (!isFiniteNumber(radius) || radius < 0.01 || radius > 100
    || !Array.isArray(start) || start.length !== 2 || !isFiniteNumber(start[0]) || !isFiniteNumber(start[1])
    || !isFiniteNumber(heading) || !Array.isArray(segments)
    || !isFiniteNumber(stepsPerSegment) || !Number.isInteger(stepsPerSegment)) {
    throw Error("INVALID_INPUT");
  }
  const [x, y] = start;
  if (segments.length === 0) throw Error("DEGENERATE_TRACE");
  if (Math.max(Math.abs(x), Math.abs(y)) > 1e4 || segments.length > 16
    || stepsPerSegment < 8 || stepsPerSegment > 1024) {
    throw Error("BUDGET_EXCEEDED");
  }
  let totalAngleBudget = 0;
  /** @type {Segment[]} */
  const checkedSegments = [];
  for (const segment of segments) {
    if (!record(segment) || !isFiniteNumber(segment.length) || !isFiniteNumber(segment.sweep)) {
      throw Error("INVALID_INPUT");
    }
    const { length, sweep } = segment;
    const relativeLength = length / radius;
    if (relativeLength < minRelativeLength) throw Error("DEGENERATE_TRACE");
    const angleBudget = relativeLength + Math.abs(sweep);
    totalAngleBudget += angleBudget;
    if (relativeLength > maxRelativeLength || Math.abs(sweep) > 2 * Math.PI
      || totalAngleBudget > maxAngleBudget || angleBudget / stepsPerSegment > maxSampleRotation) {
      throw Error("BUDGET_EXCEEDED");
    }
    checkedSegments.push({ length, sweep });
  }
  return { radius, start: [x, y], heading, segments: checkedSegments, stepsPerSegment };
}

/**
 * @param {RollingInput["start"]} start
 * @param {Point2} origin translation applied only to world coordinates
 * @param {number} heading tangent angle at the start of the segment
 * @param {number} startS
 * @param {Quaternion} startRotation
 * @param {number} radius
 * @param {Segment} segment
 */
function segmentMotion(start, origin, heading, startS, startRotation, radius, { length, sweep }) {
  const relativeLength = length / radius;
  // In the turning plane frame the rotation vector over the segment is constant.
  /** @type {Vector3} */
  const frameRotation = [-relativeLength * Math.sin(heading), relativeLength * Math.cos(heading), -sweep];
  const angle = Math.hypot(...frameRotation);
  const axis = scale(frameRotation, 1 / angle);
  const startInverse = conjugate(startRotation);

  /** @param {number} fraction @returns {Pose} */
  function poseAt(fraction) {
    const turn = sweep * fraction;
    const halfTurn = turn / 2;
    const chord = length * fraction * (halfTurn === 0 ? 1 : Math.sin(halfTurn) / halfTurn);
    const x = start[0] + chord * Math.cos(heading + halfTurn);
    const y = start[1] + chord * Math.sin(heading + halfTurn);
    /** @type {Point2} */
    const target = [origin[0] + x, origin[1] + y];
    const orientation = normalizedQuaternion(multiply(
      quaternionAround(up, turn),
      multiply(quaternionAround(axis, angle * fraction), startRotation),
    ));
    return {
      s: startS + length * fraction, center: [target[0], target[1], radius],
      localCenter: [x, y, radius], orientation, target,
    };
  }

  return {
    angle,
    normalAxis: rotateVector(startInverse, scale(axis, -1)),
    normalStart: rotateVector(startInverse, down),
    poseAt,
  };
}

/**
 * Invert the prescribed C1 planar arc chain into one nonspherical support body
 * and its prescribed rolling poses. The exact geometry is the convex hull of
 * the radius ball and the returned exterior vertices. clearanceLowerBound
 * bounds the exterior generators' clearance only. The ball is tangent.
 * @param {unknown} input planar positions and lengths in metres, angles in radians
 */
export function solveRollingFeasibility(input) {
  const { radius, start, heading, segments, stepsPerSegment } = validatedInput(input);
  let turn = Math.atan2(Math.sin(heading), Math.cos(heading));
  /** @type {Pose} */
  let last = {
    s: 0, center: [start[0], start[1], radius], localCenter: [0, 0, radius], orientation: [1, 0, 0, 0], target: start,
  };
  const motions = segments.map(segment => {
    const motion = segmentMotion([last.localCenter[0], last.localCenter[1]], start, turn, last.s, last.orientation, radius, segment);
    turn += segment.sweep;
    last = motion.poseAt(1);
    return motion;
  });

  /** @type {Vector3[]} */
  const vertices = [];
  let clearanceLowerBound = Infinity;
  for (const direction of directions) {
    const maximum = Math.max(...motions.map(motion =>
      maxArcProjection(direction, motion.normalAxis, motion.normalStart, motion.angle),
    )) + roundoffGuard;
    const extentLimit = maximum > 0 ? (1 - extraVertexMargin) / maximum : maxExtent;
    const extent = Math.min(maxExtent, extentLimit);
    if (extent <= 1 + minRelativeLength) continue;
    vertices.push(scale(direction, radius * extent));
    clearanceLowerBound = Math.min(clearanceLowerBound, radius * (1 - extent * maximum));
  }
  if (vertices.length === 0) throw Error("NO_CERTIFIED_SHAPE");

  const poses = [motions[0].poseAt(0)];
  for (const motion of motions) {
    for (let i = 1; i <= stepsPerSegment; i++) poses.push(motion.poseAt(i / stepsPerSegment));
  }
  return { shape: { radius, vertices, clearanceLowerBound }, poses };
}
