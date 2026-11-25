import { rollingAdaptiveLimits } from "./feasibility.mjs";
import { fitRollingTrace } from "./trace-spline";

export type Point2 = [number, number];
export type Vec3 = [number, number, number];
export type RollingPose = {
  s: number;
  center: Vec3;
  localCenter: Vec3;
  orientation: [number, number, number, number];
  target: Point2;
};
export type RollingTrace = { kind: "preset"; preset: "arc" | "s-bend" } | { kind: "stroke"; points: Point2[] };
export type RollingInput = { trace: RollingTrace; radius: number; quality: "compact" | "full" };
export type RollingMesh = { vertices: Float32Array; triangles: Uint32Array };
export type RollingRun = {
  target: Point2[];
  contacts: Point2[];
  poses: RollingPose[];
  shape: { radius: number; vertices: Vec3[]; clearanceLowerBound: number };
  mesh: RollingMesh;
  verification: {
    maxSlipOverSpeed: number;
    maxTraceOverRadius: number;
    minGapOverRadius: number;
    minSampledExteriorGapOverRadius: number | null;
  };
  requested?: Point2[];
  traceMetrics?: ReturnType<typeof fitRollingTrace>["metrics"];
  meshVolumeM3?: number;
  workerMs?: number;
};
export type RollingRequest = { id: number; input: RollingInput };
type RollingPhase = "trace" | "solve" | "verify" | "mesh";
export type RollingResponse =
  | { id: number; type: "progress"; progress: number; phase: RollingPhase }
  | { id: number; type: "result"; run: RollingRun }
  | { id: number; type: "error"; code: string };
export type RollingArchive = { kind: "electrotutor-rolling-lab"; schemaVersion: 1; input: RollingInput; speed: number; position: number };

type Segment = { length: number; sweep: number };
type PlanarTrack = { start: Point2; heading: number; segments: Segment[] };
const referenceArc = Math.PI / Math.SQRT2;
const presets: Record<"arc" | "s-bend", PlanarTrack> = {
  arc: { start: [0, 0], heading: 0, segments: [{ length: referenceArc, sweep: referenceArc }] },
  "s-bend": {
    start: [-1.45, -.65],
    heading: 0,
    segments: [{ length: 1.3, sweep: .9 }, { length: 1.3, sweep: -.9 }, { length: .4, sweep: 0 }],
  },
};
export const rollingArchiveMaxBytes = 64 * 1024;
export const rollingMaxStrokePoints = 512;
const strokeTolerance = .035;
const maxPolylineVertices = 9;
const minimumSpacing = .01;
const maximumTurn = 5 * Math.PI / 6;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function between(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validatedInput(value: unknown, code: string): RollingInput {
  if (!record(value) || !record(value.trace) || !between(value.radius, .25, 2)
    || (value.quality !== "compact" && value.quality !== "full")) throw Error(code);
  const { trace, radius, quality } = value;
  if (trace.kind === "preset" && (trace.preset === "arc" || trace.preset === "s-bend")) {
    return { trace: { kind: trace.kind, preset: trace.preset }, radius, quality };
  }
  if (trace.kind !== "stroke" || !Array.isArray(trace.points)
    || trace.points.length < 2 || trace.points.length > rollingMaxStrokePoints) throw Error(code);
  const points: Point2[] = Array.from(trace.points, point => {
    if (!Array.isArray(point) || point.length !== 2 || !between(point[0], -2, 2) || !between(point[1], -2, 2)) {
      throw Error(code);
    }
    return [point[0], point[1]];
  });
  return { trace: { kind: "stroke", points }, radius, quality };
}

export function readRollingArchive(text: string): RollingArchive {
  if (text.length > rollingArchiveMaxBytes || new TextEncoder().encode(text).byteLength > rollingArchiveMaxBytes) {
    throw Error("ARCHIVE_LIMIT");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw Error("INVALID_ARCHIVE"); }
  if (!record(parsed) || parsed.kind !== "electrotutor-rolling-lab" || parsed.schemaVersion !== 1
    || !between(parsed.speed, .25, 4) || !between(parsed.position, 0, 1)) throw Error("INVALID_ARCHIVE");
  return {
    kind: parsed.kind, schemaVersion: 1, input: validatedInput(parsed.input, "INVALID_ARCHIVE"),
    speed: parsed.speed, position: parsed.position,
  };
}

export function writeRollingArchive(input: RollingInput, speed: number, position: number) {
  const archive: RollingArchive = { kind: "electrotutor-rolling-lab", schemaVersion: 1, input, speed, position };
  return JSON.stringify(archive, null, 2);
}

function distance(a: Point2, b: Point2) {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function filterStroke(points: Point2[]) {
  const filtered = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    if (distance(filtered.at(-1)!, points[i]) >= minimumSpacing) filtered.push(points[i]);
  }
  const end = points.at(-1)!;
  if (filtered.length > 1 && distance(end, filtered.at(-1)!) < minimumSpacing) filtered.pop();
  filtered.push(end);
  let travelled = 0;
  for (let i = 1; i < filtered.length; i++) travelled += distance(filtered[i - 1], filtered[i]);
  if (travelled < .08 || distance(filtered[0], end) < .04) throw Error("DEGENERATE_TRACE");
  return filtered;
}

function simplify(points: Point2[]) {
  const keep = [0, points.length - 1];
  const ranges: Array<[number, number]> = [[0, points.length - 1]];
  while (ranges.length) {
    const [first, last] = ranges.pop()!;
    const [x, y] = points[first];
    const chord = distance(points[first], points[last]);
    const dx = chord ? (points[last][0] - x) / chord : 0;
    const dy = chord ? (points[last][1] - y) / chord : 0;
    let split = -1;
    let maxDeviation = strokeTolerance;
    let peakAdvance = 0;
    let peakIndex = first;
    for (let i = first + 1; i < last; i++) {
      const px = points[i][0] - x, py = points[i][1] - y;
      const advance = px * dx + py * dy;
      const projected = Math.max(0, Math.min(chord, advance));
      const deviation = Math.hypot(px - projected * dx, py - projected * dy);
      if (deviation > maxDeviation) {
        split = i;
        maxDeviation = deviation;
      }
      // Preserve a significant change in traversal order even on one straight line.
      if (peakIndex !== first && peakAdvance - advance > maxDeviation) {
        split = peakIndex;
        maxDeviation = peakAdvance - advance;
      }
      if (advance > peakAdvance) {
        peakAdvance = advance;
        peakIndex = i;
      }
    }
    if (split < 0) continue;
    keep.push(split);
    if (keep.length > maxPolylineVertices) throw Error("TRACE_COMPLEXITY");
    ranges.push([first, split], [split, last]);
  }
  return keep.sort((a, b) => a - b).map(index => points[index]);
}

function roundStroke(points: Point2[]): PlanarTrack {
  const polyline = simplify(filterStroke(points));
  const edges = polyline.slice(1).map(([x, y], i) => ({
    length: distance(polyline[i], [x, y]),
    heading: Math.atan2(y - polyline[i][1], x - polyline[i][0]),
  }));
  const segments: Segment[] = [];
  let previousTrim = 0;
  for (let i = 0; i < edges.length - 1; i++) {
    const incoming = edges[i], outgoing = edges[i + 1];
    const difference = outgoing.heading - incoming.heading;
    const sweep = Math.atan2(Math.sin(difference), Math.cos(difference));
    if (Math.abs(sweep) >= maximumTurn) throw Error("TRACE_REVERSAL");
    const trim = Math.abs(sweep) > 1e-8 ? Math.min(.16, incoming.length / 4, outgoing.length / 4) : 0;
    segments.push({ length: incoming.length - previousTrim - trim, sweep: 0 });
    if (trim) {
      const radius = trim / Math.tan(Math.abs(sweep) / 2);
      segments.push({ length: radius * Math.abs(sweep), sweep });
    }
    previousTrim = trim;
  }
  segments.push({ length: edges.at(-1)!.length - previousTrim, sweep: 0 });
  return { start: polyline[0], heading: edges[0].heading, segments };
}

function rejectSharpAlternation(points: Point2[]) {
  let sharp = 0;
  for (let i = 1; i + 1 < points.length; i++) {
    const previous = points[i - 1], current = points[i], next = points[i + 1];
    const dx = current[0] - previous[0], dy = current[1] - previous[1];
    const ex = next[0] - current[0], ey = next[1] - current[1];
    const length = Math.hypot(dx, dy), following = Math.hypot(ex, ey);
    if (length < .065 || following < .065) continue;
    const bend = Math.abs(Math.atan2(dx * ey - dy * ex, dx * ex + dy * ey));
    if (bend >= maximumTurn) throw Error("TRACE_REVERSAL");
    if (bend > 2 * Math.PI / 3 && ++sharp >= 8) throw Error("TRACE_COMPLEXITY");
  }
}

export function prepareRollingTrack(input: RollingInput) {
  const { trace, radius } = validatedInput(input, "INVALID_INPUT");
  if (trace.kind === "preset" || trace.points.length === 3) {
    const { start, heading, segments } = trace.kind === "preset" ? presets[trace.preset] : roundStroke(trace.points);
    const angularLength = Math.max(...segments.map(segment => segment.length / radius + Math.abs(segment.sweep)));
    const stepsPerSegment = Math.max(96, Math.ceil(angularLength / .06));
    return { start: [...start] as Point2, heading, segments: segments.map(segment => ({ ...segment })), radius, stepsPerSegment };
  }
  rejectSharpAlternation(trace.points);
  const { start, heading, segments, processed, metrics: traceMetrics } = fitRollingTrace(trace.points);
  const maxPoseRotation = .035;
  const segmentSteps = segments.map(segment => Math.max(2,
    Math.ceil((segment.length / radius + Math.abs(segment.sweep)) / maxPoseRotation)));
  if (segments.length > rollingAdaptiveLimits.maxSegments || segmentSteps.some(steps => steps > rollingAdaptiveLimits.maxStepsPerSegment)
    || segmentSteps.reduce((total, steps) => total + steps, 1) > rollingAdaptiveLimits.maxPoses) {
    throw Error("TRACE_BUDGET");
  }
  return { start, heading, segments, processed, traceMetrics, radius, segmentSteps };
}

export function rollingPreset(preset: "arc" | "s-bend"): Point2[] {
  const track = presets[preset];
  let heading = track.heading;
  let start: Point2 = [...track.start];
  const points: Point2[] = [start];
  for (const { length, sweep } of track.segments) {
    for (let i = 1; i <= 24; i++) {
      const fraction = i / 24;
      const halfTurn = sweep * fraction / 2;
      const chord = length * fraction * (halfTurn ? Math.sin(halfTurn) / halfTurn : 1);
      points.push([start[0] + chord * Math.cos(heading + halfTurn), start[1] + chord * Math.sin(heading + halfTurn)]);
    }
    start = points.at(-1)!;
    heading += sweep;
  }
  return points;
}

export function writeRollingObj(mesh: RollingMesh) {
  const lines = ["# ElectroTutor rolling hull", "# units: m", "o RollingBody"];
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    lines.push(`v ${mesh.vertices[i]} ${mesh.vertices[i + 1]} ${mesh.vertices[i + 2]}`);
  }
  for (let i = 0; i < mesh.triangles.length; i += 3) {
    lines.push(`f ${mesh.triangles[i] + 1} ${mesh.triangles[i + 1] + 1} ${mesh.triangles[i + 2] + 1}`);
  }
  return lines.join("\n") + "\n";
}
