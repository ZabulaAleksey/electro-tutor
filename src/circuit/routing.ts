import type { Drawing, Placement, Point } from "./drawing";

type Box = { left: number; right: number; top: number; bottom: number };
type Port = { pin: Point; escape: Point; owner?: string };
export type Routing = { paths: Record<string, Point[]>; unrouted: string[] };
const terminalOffsets: Record<string, number> = { r: 29, l: 27, c: 27, diode: 11.5, voltage: 22 };
const bounds = { left: 1, right: 539, top: 1, bottom: 359 };
const limit = 9_000;
const equal = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const distance = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

function offset(placement: Placement, delta: number): Point {
  const right = [1, 0, -1, 0][placement.rotation / 90];
  const down = [0, 1, 0, -1][placement.rotation / 90];
  return { x: placement.x + right * delta, y: placement.y + down * delta };
}

function contains(box: Box, point: Point): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

function intersects(box: Box, a: Point, b: Point): boolean {
  return Math.min(a.x, b.x) <= box.right && Math.max(a.x, b.x) >= box.left &&
    Math.min(a.y, b.y) <= box.bottom && Math.max(a.y, b.y) >= box.top;
}

export function drawingPorts(drawing: Drawing): Map<string, Port> {
  const ports = new Map<string, Port>();
  for (const id of drawing.topology.junctions) {
    const pin = drawing.junctionPositions[id];
    if (pin) ports.set(id, { pin, escape: pin });
  }
  for (const component of drawing.topology.components) {
    const placement = drawing.positions[component.id];
    const size = terminalOffsets[component.kind];
    if (!placement || !size || component.terminals.length !== 2) continue;
    component.terminals.forEach((terminal, index) => {
      const side = index ? 1 : -1;
      ports.set(terminal, { pin: offset(placement, size * side), escape: offset(placement, 36 * side), owner: component.id });
    });
  }
  return ports;
}

function simplify(points: Point[]): Point[] {
  return points.filter((point, i) => !i || !equal(point, points[i - 1])).filter((point, i, list) => {
    const previous = list[i - 1], next = list[i + 1];
    return !previous || !next || !(
      previous.x === point.x && next.x === point.x || previous.y === point.y && next.y === point.y
    );
  });
}

function route(from: Port, to: Port, obstacles: [string, Box][], wirePaths: Point[][]): Point[] | null {
  if (equal(from.pin, to.pin) || [from, to].some(({ pin, escape, owner }) =>
    obstacles.some(([id, box]) => id !== owner && intersects(box, pin, escape)))) return null;
  const boxes = obstacles.map(([, box]) => box);
  const axis = (key: "x" | "y", low: "left" | "top", high: "right" | "bottom") =>
    [...new Set([from.escape[key], to.escape[key], bounds[low], bounds[high],
      ...boxes.flatMap(box => [box[low] - 2, box[high] + 2])])]
      .filter(value => value >= bounds[low] && value <= bounds[high]).sort((a, b) => a - b);
  const xs = axis("x", "left", "right"), ys = axis("y", "top", "bottom");
  if (xs.length * ys.length > limit) return null;
  const columns = xs.length;
  const points = ys.flatMap(y => xs.map(x => ({ x, y })));
  const indexOf = (point: Point) => xs.indexOf(point.x) + ys.indexOf(point.y) * columns;
  const start = indexOf(from.escape), end = indexOf(to.escape);
  if (start < 0 || end < 0 || !points[start] || !points[end]) return null;
  const costs = new Map([[start * 3, 0]]);
  const previous = new Map<number, number>();
  const open = new Set([start * 3]);
  const segments = wirePaths.flatMap(path => path.slice(1).map((point, i) => [path[i], point] as const));
  let steps = 0;
  while (open.size && steps++ < limit) {
    let state = -1, best = Infinity;
    for (const candidate of open) {
      const score = costs.get(candidate)! + distance(points[Math.floor(candidate / 3)], to.escape);
      if (score < best) { state = candidate; best = score; }
    }
    const index = Math.floor(state / 3);
    if (index === end) {
      const path = [to.pin];
      for (let current: number | undefined = state; current !== undefined; current = previous.get(current)) {
        path.push(points[Math.floor(current / 3)]);
      }
      return simplify([...path, from.pin].reverse());
    }
    open.delete(state);
    const adjacent = [index - columns, index + columns];
    if (index % columns > 0) adjacent.push(index - 1);
    if (index % columns < columns - 1) adjacent.push(index + 1);
    const a = points[index];
    for (const candidate of adjacent) {
      const b = points[candidate];
      if (!b || boxes.some(box => intersects(box, a, b))) continue;
      const vertical = a.x === b.x;
      const overlap = segments.some(([c, d]) => vertical
        ? c.x === a.x && d.x === a.x && Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y))
        : c.y === a.y && d.y === a.y && Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)));
      if (overlap) continue;
      const direction = vertical ? 1 : 2;
      const key = candidate * 3 + direction;
      const bend = state % 3 && state % 3 !== direction ? 24 : 0;
      const cost = costs.get(state)! + distance(a, b) + bend;
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost);
      previous.set(key, state);
      open.add(key);
    }
  }
  return null;
}

export function routeDrawing(drawing: Drawing): Routing {
  const ports = drawingPorts(drawing);
  const obstacles = Object.entries(drawing.positions).map(([id, { x, y, rotation }]): [string, Box] => {
    const vertical = rotation % 180 !== 0;
    const w = vertical ? 22 : 31, h = vertical ? 31 : 22;
    return [id, { left: x - w, right: x + w, top: y - h, bottom: y + h }];
  });
  const paths: Record<string, Point[]> = Object.create(null);
  const unrouted: string[] = [];
  for (const wire of drawing.topology.wires) {
    const from = ports.get(wire.from), to = ports.get(wire.to);
    const points = from && to && contains(bounds, from.escape) && contains(bounds, to.escape)
      ? route(from, to, obstacles, Object.values(paths)) : null;
    if (points) paths[wire.id] = points;
    else unrouted.push(wire.id);
  }
  return { paths, unrouted };
}
