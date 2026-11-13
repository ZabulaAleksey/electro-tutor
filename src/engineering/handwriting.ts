import type { Point } from "./gestures";

export type Ink = Point[][];
export type SketchKind = "line" | "wire" | "r" | "c" | "l" | "source" | "current" | "switch" | "ground" | "junction";
export type Sketch = { kind: SketchKind; center: Point; angle: number; terminals?: [Point, Point] };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const length = (points: Point[]) => points.slice(1).reduce((sum, point, index) => sum + distance(point, points[index]), 0);
const ends = (stroke: Point[]): [Point, Point] => [stroke[0], stroke.at(-1)!];
const direction = ([a, b]: [Point, Point]) => Math.atan2(b.y - a.y, b.x - a.x);
const straight = (stroke: Point[]) => distance(...ends(stroke)) / (length(stroke) || 1) >= .94;
const strokeDot = (stroke: Point[], scale: number) => length(stroke) <= 6 / scale;

function sample(points: Point[], count: number): Point[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + distance(points[i - 1], points[i]));
  const total = lengths.at(-1)!;
  if (!total) return Array.from({ length: count }, () => points[0]);
  let index = 1;
  return Array.from({ length: count }, (_, i) => {
    const offset = total * i / (count - 1);
    while (index < lengths.length - 1 && lengths[index] < offset) index++;
    const ratio = (offset - lengths[index - 1]) / (lengths[index] - lengths[index - 1] || 1);
    const a = points[index - 1], b = points[index];
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
  });
}

const path = (...pairs: [number, number][]): Point[] => pairs.map(([x, y]) => ({ x, y }));
const circle = Array.from({ length: 33 }, (_, i) => {
  const angle = i * Math.PI / 16;
  return { x: Math.cos(angle) * 17, y: Math.sin(angle) * 17 };
});
const coil = Array.from({ length: 33 }, (_, i) => ({ x: i * 2 - 32, y: -11 * Math.abs(Math.sin(i * Math.PI / 8)) }));
const templates: { kind: SketchKind; strokes: Ink; angle: number; cyclic?: boolean }[] = [
  { kind: "r", strokes: [path([-26, -10], [26, -10], [26, 10], [-26, 10], [-26, -10])], angle: 0, cyclic: true },
  { kind: "r", strokes: [path([-28, 0], [-20, -7], [-12, 7], [-4, -7], [4, 7], [12, -7], [20, 7], [28, 0])], angle: 0 },
  { kind: "r", strokes: [path([-32, 0], [-24, -9], [-16, 9], [-8, -9], [0, 9], [8, -9], [16, 9], [24, -9], [32, 0])], angle: 0 },
  { kind: "l", strokes: [coil], angle: 0 },
  { kind: "c", strokes: [path([-5, -17], [-5, 17]), path([5, -17], [5, 17])], angle: 0 },
  { kind: "ground", strokes: [path([-18, 0], [18, 0]), path([-12, 6], [12, 6]), path([-6, 12], [6, 12])], angle: 90 },
  { kind: "switch", strokes: [path([-23, 0], [-13, 0], [8, -10]), path([13, 0], [23, 0])], angle: 0 },
  { kind: "switch", strokes: [path([-23, 0], [-13, 0]), path([-13, 0], [8, -10]), path([13, 0], [23, 0])], angle: 0 },
  { kind: "source", strokes: [circle, path([-5, -6], [5, -6]), path([0, -11], [0, -1]), path([-5, 7], [5, 7])], angle: 90, cyclic: true },
  { kind: "current", strokes: [circle, path([0, 10], [0, -10]), path([-5, -3], [0, -10], [5, -3])], angle: 90, cyclic: true },
  { kind: "current", strokes: [circle, path([0, 10], [0, -10], [-5, -3]), path([0, -10], [5, -3])], angle: 90, cyclic: true },
];

function normal(strokes: Ink, radians = 0) {
  const cosine = Math.cos(radians), sine = Math.sin(radians);
  const sampled = strokes.map(stroke => sample(stroke, 24).map(({ x, y }) => ({
    x: x * cosine - y * sine, y: x * sine + y * cosine,
  })));
  const points = sampled.flat();
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) || 1;
  return sampled.map(stroke => stroke.map(({ x, y }) => ({ x: (x - center.x) / size, y: (y - center.y) / size })));
}

function match(a: Ink, b: Ink, cyclic: boolean) {
  const used = new Set<number>();
  let total = 0;
  for (const [index, input] of a.entries()) {
    let best = Infinity, choice = -1;
    for (const [candidate, reference] of b.entries()) {
      if (used.has(candidate) || (cyclic && (index === 0) !== (candidate === 0))) continue;
      const steps = cyclic && index === 0 ? input.length - 1 : 1;
      const count = steps > 1 ? steps : input.length;
      for (let offset = 0; offset < steps; offset++) for (const reversed of [false, true]) {
        let error = 0;
        for (let j = 0; j < count; j++) {
          const k = (offset + (reversed ? count - 1 - j : j)) % count;
          error += distance(input[j], reference[k]) ** 2;
        }
        if (error < best) { best = error; choice = candidate; }
      }
    }
    used.add(choice);
    total += best / input.length;
  }
  return Math.sqrt(total / a.length);
}
const references = templates.map(template => ({ ...template, points: normal(template.strokes) }));

export function recognizeInk(ink: Ink, scale: number): Sketch | null {
  if (!Number.isFinite(scale) || scale <= 0 || !ink.length || ink.length > 6 || ink.some(stroke => !stroke.length)) return null;
  const last = ink.at(-1)!;
  const terminals = ends(last);
  const center = middle(...terminals);
  if (ink.length === 3 && ink.slice(0, 2).every(stroke => strokeDot(stroke, scale)) && straight(last)) {
    const a = ink[0][0], b = ink[1][0];
    const close = (p: Point, q: Point) => distance(p, q) * scale <= 12;
    if (distance(a, b) * scale >= 30 &&
        (close(a, terminals[0]) && close(b, terminals[1]) || close(b, terminals[0]) && close(a, terminals[1]))) {
      return { kind: "line", center: middle(a, b), angle: direction([a, b]) * 180 / Math.PI, terminals: [a, b] };
    }
  }
  if (ink.length === 1 && strokeDot(last, scale)) return { kind: "junction", center, angle: 0 };
  if (ink.length === 1 && straight(last)) {
    return { kind: "wire", center, angle: direction(terminals) * 180 / Math.PI, terminals };
  }
  // These templates start with the perimeter when the mark has a closed body.
  const candidates = references.filter(reference => reference.strokes.length === ink.length &&
    (!reference.cyclic || distance(...ends(ink[0])) <= length(ink[0]) * .13));
  if (!candidates.length) return null;
  const matches = new Map<SketchKind, { error: number; angle: number }>();
  for (let angle = 0; angle < 360; angle += 10) {
    const rotated = normal(ink, -angle * Math.PI / 180);
    for (const reference of candidates) {
      const error = match(rotated, reference.points, !!reference.cyclic);
      if (error < (matches.get(reference.kind)?.error ?? Infinity)) matches.set(reference.kind, { error, angle: angle + reference.angle });
    }
  }
  const [[kind, best], second] = [...matches].sort((a, b) => a[1].error - b[1].error);
  if (best.error > .12 || second && second[1].error - best.error < .018) return null;
  const points = ink.flat(), xs = points.map(p => p.x), ys = points.map(p => p.y);
  const centerPoint = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const hasOpenLeads = kind === "switch" || kind === "l" || kind === "r" && distance(...ends(last)) > 0 &&
    distance(...ends(last)) > Math.max(...last.map(point=>distance(point,last[0]))) * .75;
  if (!hasOpenLeads) return { kind, center: centerPoint, angle: best.angle };
  const angle = best.angle * Math.PI / 180;
  const project = (point: Point) => point.x * Math.cos(angle) + point.y * Math.sin(angle);
  const sorted = ink.flatMap(ends).sort((a, b) => project(a) - project(b));
  return { kind, center: centerPoint, angle: best.angle, terminals: [sorted[0], sorted.at(-1)!] };
}

export function boundedStroke(points: Point[]) {
  return (points.length > 48 ? sample(points, 48) : points).map(({ x, y }) => ({
    x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
  }));
}

export function readInk(input: unknown): Ink[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 20).filter((ink): ink is Ink => Array.isArray(ink) && ink.length > 0 && ink.length <= 6 &&
    ink.every(stroke => Array.isArray(stroke) && stroke.length > 0 && stroke.length <= 48 &&
      stroke.every((point: Point | null) => point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
        Math.abs(point.x) <= 1000000 && Math.abs(point.y) <= 1000000)))
    .map(ink => ink.map(stroke => stroke.map(({ x, y }) => ({ x, y }))));
}
