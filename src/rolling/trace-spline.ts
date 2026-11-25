import type { Point2 } from "./lab-model";

type Segment = { length: number; sweep: number };
type Arc = Segment & { start: Point2; heading: number };
type Cubic = readonly [Point2, Point2, Point2, Point2];
type Edge = { start: Point2; end: Point2; sagitta: number; arc: number };

export type RollingTraceMetrics = {
  method: "cubic-biarc";
  closed: boolean;
  sourceLength: number;
  length: number;
  maxDeviation: number;
  maxCurvature: number;
  seamAngle: number;
  tolerance: number;
  inputPoints: number;
  retainedPoints: number;
  arcCount: number;
};

export type FittedRollingTrace = {
  start: Point2;
  heading: number;
  segments: Segment[];
  processed: Point2[];
  metrics: RollingTraceMetrics;
};

const maxPoints = 512;
const maxArcs = 256;
const maxSamples = 4096;
const maxSweep = .55;
const maxArcLength = .22;
const minimumLength = .08;
const epsilon = 1e-11;
const lerp = (a: Point2, b: Point2, t: number): Point2 => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
const minus = (a: Point2, b: Point2): Point2 => [a[0] - b[0], a[1] - b[1]];
const norm = ([x, y]: Point2) => Math.hypot(x, y);
const distance = (a: Point2, b: Point2) => norm(minus(a, b));
const dot = (a: Point2, b: Point2) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Point2, b: Point2) => a[0] * b[1] - a[1] * b[0];
const angle = ([x, y]: Point2) => Math.atan2(y, x);
const turn = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const knotStep = (tolerance: number) => Math.max(.025, Math.min(.15, .65 * Math.sqrt(tolerance)));

function lengthIndex(points: readonly Point2[]) {
  const index = [0];
  for (let i = 1; i < points.length; i++) index.push(index[i - 1] + distance(points[i - 1], points[i]));
  return index;
}

function removeNearPoints(points: readonly Point2[], spacing: number): Point2[] {
  const result: Point2[] = [points[0]];
  for (const point of points.slice(1, -1)) {
    if (distance(result.at(-1)!, point) >= spacing) result.push(point);
  }
  const end = points.at(-1)!;
  if (result.length > 1 && distance(result.at(-1)!, end) < spacing) result.pop();
  result.push(end);
  return result;
}

function makeKnots(points: Point2[], closed: boolean, tolerance: number) {
  const index = lengthIndex(points), length = index.at(-1)!;
  const spacing = Math.min(knotStep(tolerance), closed ? length / 8 : length);
  if (Math.ceil(length / spacing) > maxArcs) throw Error("TRACE_BUDGET");
  const pointAt = (at: number) => {
    if (at === 0) return points[0];
    if (at === length) return points.at(-1)!;
    const edge = index.findIndex(value => value >= at);
    return lerp(points[edge - 1], points[edge], (at - index[edge - 1]) / (index[edge] - index[edge - 1]));
  };
  // Sample salient extrema explicitly so equal-height knots do not flatten a genuine turning point.
  const candidates: { at: number; prominence: number }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const at = index[i];
    if (at <= spacing || length - at <= spacing) continue;
    const left = pointAt(at - spacing), right = pointAt(at + spacing);
    const prominence = Math.max(...([0, 1] as const).map(axis => {
      const value = points[i][axis];
      const direction = Math.sign(value - points[i - 1][axis]);
      if (!direction || direction * (value - points[i + 1][axis]) < 0) return 0;
      return Math.min(direction * (value - left[axis]), direction * (value - right[axis]));
    }));
    if (prominence >= tolerance * .22) candidates.push({ at, prominence });
  }
  const anchors: number[] = [];
  for (const { at } of candidates.toSorted((a, b) => b.prominence - a.prominence)) {
    if (anchors.every(other => Math.abs(at - other) > spacing)) anchors.push(at);
  }
  const bounds = [0, ...anchors.toSorted((a, b) => a - b), length];
  const positions = [0];
  for (let i = 1; i < bounds.length; i++) {
    const from = bounds[i - 1], to = bounds[i];
    const count = Math.ceil((to - from) / spacing);
    if (positions.length + count > maxArcs + 1) throw Error("TRACE_BUDGET");
    for (let j = 1; j < count; j++) positions.push(from + (to - from) * j / count);
    if (!closed || i < bounds.length - 1) positions.push(to);
  }
  const knots = positions.map(pointAt);
  const fixed = new Set(bounds);
  // A bounded symmetric filter damps pointer jitter between fixed endpoints and extrema.
  return knots.map((p, i) => {
    if (fixed.has(positions[i])) return p;
    const next = knots[(i + 1) % knots.length], previous = knots[i - 1];
    const middle = lerp(previous, next, .5);
    const delta = distance(middle, p);
    return delta ? lerp(p, middle, Math.min(.2, tolerance * .16 / delta)) : p;
  });
}

function circularControls(points: Point2[], tolerance: number) {
  const n = points.length - 1;
  if (n < 20) return undefined;
  const start = points[0];
  const a = minus(points[Math.floor(n / 3)], start), b = minus(points[Math.floor(2 * n / 3)], start);
  const determinant = 2 * cross(a, b), qa = dot(a, a), qb = dot(b, b);
  if (Math.abs(determinant) <= epsilon) return undefined;
  const offset: Point2 = [(qa * b[1] - qb * a[1]) / determinant, (a[0] * qb - b[0] * qa) / determinant];
  const radius = norm(offset), center: Point2 = [start[0] + offset[0], start[1] + offset[1]];
  const radialTolerance = Math.min(tolerance / 20, radius * 1e-5);
  if (points.some(p => Math.abs(distance(p, center) - radius) > radialTolerance)) return undefined;
  const angles = points.map(p => angle(minus(p, center)));
  const increments = angles.slice(1).map((heading, i) => turn(angles[i], heading));
  const winding = increments.reduce((sum, heading) => sum + heading, 0);
  if (Math.abs(Math.abs(winding) - 2 * Math.PI) > epsilon
    || increments.some(heading => Math.sign(winding) * heading <= 0 || Math.abs(heading) > .32)) return undefined;
  // Use exact circular endpoints and tangents only for a densely sampled, single circular turn.
  const count = Math.max(12, Math.ceil(2 * Math.PI * radius / knotStep(tolerance)));
  if (count > maxArcs) throw Error("TRACE_BUDGET");
  const step = Math.sign(winding) * 2 * Math.PI / count;
  const derivative = 4 * radius * Math.tan(step / 4);
  const phases = Array.from({ length: count }, (_, i) => angles[0] + i * step);
  return {
    knots: phases.map((phase, i): Point2 => i ? [center[0] + radius * Math.cos(phase), center[1] + radius * Math.sin(phase)] : start),
    tangents: phases.map((phase): Point2 => [-derivative * Math.sin(phase), derivative * Math.cos(phase)]),
  };
}

function checkReversals(points: Point2[], closed: boolean, spacing: number) {
  for (let i = closed ? 0 : 1; i < points.length - Number(!closed); i++) {
    const previous = points[(i - 1 + points.length) % points.length], next = points[(i + 1) % points.length];
    const a = minus(points[i], previous), b = minus(next, points[i]);
    const first = norm(a), second = norm(b);
    if (first >= spacing && second >= spacing && dot(a, b) < -Math.sqrt(3) / 2 * first * second) throw Error("TRACE_REVERSAL");
  }
}

function tangent(knots: Point2[], i: number, closed: boolean): Point2 {
  if (!closed && i === 0) return minus(knots[1], knots[0]);
  if (!closed && i === knots.length - 1) return minus(knots[i], knots[i - 1]);
  const a = minus(knots[i], knots[(i - 1 + knots.length) % knots.length]);
  const b = minus(knots[(i + 1) % knots.length], knots[i]);
  // Limit each Hermite slope to the adjacent secants where that coordinate is monotone.
  const axis = (before: number, after: number) => before * after > 0
    ? Math.sign(before) * Math.min(Math.abs((before + after) / 2), 2 * Math.abs(before), 2 * Math.abs(after)) : 0;
  const limited: Point2 = [axis(a[0], b[0]), axis(a[1], b[1])];
  return norm(limited) > epsilon ? limited : lerp(a, b, .5);
}

function arcPoint(arc: Arc, t: number): Point2 {
  const half = arc.sweep * t / 2;
  const chord = arc.length * t * (half ? Math.sin(half) / half : 1);
  return [arc.start[0] + chord * Math.cos(arc.heading + half), arc.start[1] + chord * Math.sin(arc.heading + half)];
}

function biarc([p, c, d, q]: Cubic): Arc[] {
  const a = minus(c, p), b = minus(q, d), v = minus(q, p);
  const na = norm(a), nb = norm(b), chord = norm(v);
  if (Math.min(na, nb, chord) <= epsilon) return [];
  const t0: Point2 = [a[0] / na, a[1] / na], t1: Point2 = [b[0] / nb, b[1] / nb];
  const start = angle(t0), end = angle(t1), secant = angle(v);
  if (Math.abs(turn(start, secant)) < 1e-10 && Math.abs(turn(end, secant)) < 1e-10) {
    return [{ start: p, heading: start, length: chord, sweep: 0 }];
  }
  // Equal tangent offsets give a common-tangent join. The rationalized root avoids cancellation.
  const alpha = Math.max(0, 2 * (1 - dot(t0, t1)));
  const beta = dot(v, [t0[0] + t1[0], t0[1] + t1[1]]);
  const denominator = Math.sqrt(beta * beta + alpha * chord * chord) + beta;
  if (denominator <= epsilon) return [];
  const offset = chord * chord / denominator;
  const mid: Point2 = [(p[0] + q[0] + offset * (t0[0] - t1[0])) / 2, (p[1] + q[1] + offset * (t0[1] - t1[1])) / 2];
  const firstSweep = 2 * turn(start, angle(minus(mid, p)));
  const secondSweep = 2 * turn(angle(minus(q, mid)), end);
  if (Math.abs(turn(start + firstSweep, end - secondSweep)) > 1e-8) return [];
  const arcLength = (projected: number, half: number) => projected * (half ? half / Math.sin(half) : 1);
  return [
    { start: p, heading: start, length: arcLength(distance(p, mid), firstSweep / 2), sweep: firstSweep },
    { start: mid, heading: start + firstSweep, length: arcLength(distance(mid, q), secondSweep / 2), sweep: secondSweep },
  ];
}

function cubicSplit([a, b, c, d]: Cubic, t: number): [Cubic, Cubic] {
  const ab = lerp(a, b, t), bc = lerp(b, c, t), cd = lerp(c, d, t);
  const left = lerp(ab, bc, t), right = lerp(bc, cd, t), mid = lerp(left, right, t);
  return [[a, ab, left, mid], [mid, right, cd, d]];
}

function pointOnPair(segments: Arc[], fraction: number) {
  const [first, second] = segments;
  if (!second) return arcPoint(first, fraction);
  const length = (first.length + second.length) * fraction;
  return length <= first.length ? arcPoint(first, length / first.length) : arcPoint(second, (length - first.length) / second.length);
}

function forwardOnMonotoneAxes([a, b, c, d]: Cubic, arcs: Arc[]) {
  return ([0, 1] as const).every(axis => {
    const increments = [b[axis] - a[axis], c[axis] - b[axis], d[axis] - c[axis]];
    const sign = Math.sign(d[axis] - a[axis]);
    if (!sign || increments.some(delta => sign * delta < -epsilon)) return true;
    const component = axis === 0 ? Math.cos : Math.sin;
    // Within maxSweep an axis component cannot change sign twice.
    return arcs.every(arc => sign * component(arc.heading) >= -epsilon
      && sign * component(arc.heading + arc.sweep) >= -epsilon);
  });
}

function compile(curve: Cubic, arcs: Arc[], error: number, depth = 0) {
  const pair = biarc(curve);
  if (pair.length && pair.every(arc => arc.length > epsilon && arc.length <= maxArcLength && Math.abs(arc.sweep) <= maxSweep)
    && forwardOnMonotoneAxes(curve, pair)
    && [.25, .5, .75].every(t => distance(cubicSplit(curve, t)[0][3], pointOnPair(pair, t)) <= error)) {
    if (arcs.length + pair.length > maxArcs) throw Error("TRACE_BUDGET");
    arcs.push(...pair);
    return;
  }
  if (depth === 9) throw Error("TRACE_SHAPE_ERROR");
  for (const half of cubicSplit(curve, .5)) compile(half, arcs, error, depth + 1);
}

function segmentDistanceSquared(px: number, py: number, a: Point2, b: Point2) {
  const x = b[0] - a[0], y = b[1] - a[1], dx = px - a[0], dy = py - a[1];
  const square = x * x + y * y;
  const t = square ? Math.max(0, Math.min(1, (dx * x + dy * y) / square)) : 0;
  return (dx - t * x) ** 2 + (dy - t * y) ** 2;
}

function edgesOf(points: readonly Point2[]): Edge[] {
  return points.slice(1).map((point, i) => ({ start: points[i], end: point, sagitta: 0, arc: i }));
}

function inspectCrossings(edges: Edge[], closed: boolean, arcCount: number) {
  for (const [i, a] of edges.entries()) for (let j = i + 1; j < edges.length; j++) {
    const b = edges[j];
    if (b.arc - a.arc <= 1 || (closed && a.arc === 0 && b.arc === arcCount - 1)) continue;
    const gap = a.sagitta + b.sagitta + epsilon;
    const separated = ([0, 1] as const).some(axis =>
      Math.max(a.start[axis], a.end[axis]) + gap < Math.min(b.start[axis], b.end[axis])
      || Math.max(b.start[axis], b.end[axis]) + gap < Math.min(a.start[axis], a.end[axis]));
    if (separated) continue;
    const va = minus(a.end, a.start), vb = minus(b.end, b.start);
    if (cross(va, minus(b.start, a.start)) * cross(va, minus(b.end, a.start)) < 0
      && cross(vb, minus(a.start, b.start)) * cross(vb, minus(a.end, b.start)) < 0) throw Error("TRACE_SHAPE_ERROR");
    const minDistance = Math.min(segmentDistanceSquared(...a.start, b.start, b.end), segmentDistanceSquared(...a.end, b.start, b.end),
      segmentDistanceSquared(...b.start, a.start, a.end), segmentDistanceSquared(...b.end, a.start, a.end));
    if (minDistance <= gap * gap) throw Error("TRACE_SHAPE_ERROR");
  }
}

function sampleArcs(start: Point2, heading: number, segments: Segment[], step: number) {
  const processed = [start], edges: Edge[] = [];
  for (const [i, segment] of segments.entries()) {
    const arc = { start: processed.at(-1)!, heading, ...segment };
    const count = Math.max(1, Math.ceil(segment.length / step), Math.ceil(Math.abs(segment.sweep) / .08));
    if (processed.length + count > maxSamples) throw Error("TRACE_BUDGET");
    const sagitta = segment.sweep ? 2 * segment.length * Math.sin(segment.sweep / (4 * count)) ** 2 / Math.abs(segment.sweep) : 0;
    for (let j = 1; j <= count; j++) {
      const sample = arcPoint(arc, j / count);
      edges.push({ start: processed.at(-1)!, end: sample, arc: i, sagitta });
      processed.push(sample);
    }
    heading += segment.sweep;
  }
  return { processed, edges, heading };
}

function directedDeviation(from: Edge[], to: Edge[], step: number) {
  let maxDistance = 0, maxUncertainty = 0, count = 0;
  for (const { start, end } of from) {
    const length = distance(start, end), spans = Math.max(1, Math.ceil(length / step));
    if ((count += spans + 1) > 2 * maxSamples) throw Error("TRACE_BUDGET");
    maxUncertainty = Math.max(maxUncertainty, length / (2 * spans));
    for (let i = 0; i <= spans; i++) {
      const [x, y] = lerp(start, end, i / spans);
      let nearest = Infinity;
      for (const target of to) {
        nearest = Math.min(nearest, segmentDistanceSquared(x, y, target.start, target.end));
        if (nearest === 0) break;
      }
      maxDistance = Math.max(maxDistance, nearest);
    }
  }
  return Math.sqrt(maxDistance) + maxUncertainty;
}

export function fitRollingTrace(points: readonly Point2[], tolerance = .035): FittedRollingTrace {
  if (points.length < 2) throw Error("DEGENERATE_TRACE");
  if (points.length > maxPoints) throw Error("TRACE_BUDGET");
  if (!Number.isFinite(tolerance) || tolerance <= 0 || points.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y))) {
    throw Error("TRACE_SHAPE_ERROR");
  }
  const sourceLength = lengthIndex(points).at(-1)!;
  if (sourceLength < minimumLength) throw Error("DEGENERATE_TRACE");
  const spacing = Math.min(.008, tolerance / 4);
  const retained = removeNearPoints(points, spacing);
  const endGap = distance(retained[0], retained.at(-1)!);
  const closeLimit = Math.min(.02, tolerance / 2, sourceLength / 30);
  const first = minus(retained[1], retained[0]), last = minus(retained.at(-1)!, retained.at(-2)!);
  const closed = endGap <= closeLimit && retained.length >= 5 && (endGap <= epsilon || dot(first, last) > 0);
  if (endGap <= epsilon && !closed) throw Error("DEGENERATE_TRACE");
  if (closed) retained[retained.length - 1] = retained[0];
  const retainedInterior = closed ? retained.slice(0, -1) : retained;
  checkReversals(retainedInterior, closed, Math.max(spacing, tolerance / 3));
  inspectCrossings(edgesOf(retained), closed, retained.length - 1);
  const circular = closed ? circularControls(retained, tolerance) : undefined;
  const knots = circular?.knots ?? makeKnots(retained, closed, tolerance);
  checkReversals(knots, closed, epsilon);
  const tangents = circular?.tangents ?? knots.map((_, i) => tangent(knots, i, closed));
  const arcs: Arc[] = [];
  for (let i = 0; i < knots.length - Number(!closed); i++) {
    const j = (i + 1) % knots.length;
    const [x, y] = knots[i], [endX, endY] = knots[j];
    const [a, b] = tangents[i], [c, d] = tangents[j];
    compile([knots[i], [x + a / 3, y + b / 3], [endX - c / 3, endY - d / 3], knots[j]], arcs, tolerance / 8);
  }
  const { start, heading } = arcs[0];
  const segments = arcs.map(({ length, sweep }) => ({ length, sweep }));
  const step = Math.min(.025, tolerance / 3);
  const replay = sampleArcs(start, heading, segments, step);
  inspectCrossings(replay.edges, closed, arcs.length);
  const original = edgesOf(points);
  const maxDeviation = Math.max(directedDeviation(original, replay.edges, step), directedDeviation(replay.edges, original, step))
    + Math.max(...replay.edges.map(edge => edge.sagitta));
  const seamAngle = closed ? Math.abs(turn(heading, replay.heading)) : 0;
  if (maxDeviation > tolerance || distance(replay.processed.at(-1)!, closed ? start : points.at(-1)!) > 1e-8
    || seamAngle > 1e-8) throw Error("TRACE_SHAPE_ERROR");
  return {
    start: [...start], heading, segments, processed: replay.processed.map(point => [...point]),
    metrics: {
      method: "cubic-biarc", closed, sourceLength, length: segments.reduce((sum, arc) => sum + arc.length, 0),
      maxDeviation, maxCurvature: Math.max(...segments.map(arc => Math.abs(arc.sweep) / arc.length)),
      seamAngle, tolerance, inputPoints: points.length, retainedPoints: retained.length, arcCount: arcs.length,
    },
  };
}
