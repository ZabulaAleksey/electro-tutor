import type { Drawing, Placement, Point } from "./drawing";

type Box = { left: number; right: number; top: number; bottom: number };
type Port = { pin: Point; escape: Point; owner?: string };
export type Routing = { paths: Record<string, Point[]>; unrouted: string[] };
const terminalOffsets: Record<string, number> = { r: 29, l: 27, c: 27, diode: 11.5, voltage: 22, line: 29 };
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
    const size = placement?.span ? placement.span / 2 : terminalOffsets[component.kind];
    if (!placement || !size || component.terminals.length !== 2) continue;
    component.terminals.forEach((terminal, index) => {
      const side = index ? 1 : -1;
      ports.set(terminal, { pin: offset(placement, size * side), escape: offset(placement, (size + 7) * side), owner: component.id });
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

function positiveOverlap(a: Point, b: Point, c: Point, d: Point): boolean {
  if (a.x === b.x && c.x === d.x && a.x === c.x) {
    return Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) > Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y));
  }
  return a.y === b.y && c.y === d.y && a.y === c.y &&
    Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) > Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x));
}

function route(from: Port, to: Port, obstacles: [string, Box][], wirePaths: Point[][]): Point[] | null {
  if (equal(from.pin, to.pin) || [from, to].some(({ pin, escape, owner }) =>
    obstacles.some(([id, box]) => id !== owner && intersects(box, pin, escape)))) return null;
  const segments = wirePaths.flatMap(path => path.slice(1).map((point, i) => [path[i], point] as const));
  if ([from, to].some(({ pin, escape }) => segments.some(([c, d]) => positiveOverlap(pin, escape, c, d)))) return null;
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
      if (segments.some(([c, d]) => positiveOverlap(a, b, c, d))) continue;
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

export function routingScore(routing: Routing): number[] {
  const paths = Object.values(routing.paths);
  const segments = paths.flatMap((path, wire) => path.slice(1).map((end, i) => ({ start: path[i], end, wire })));
  let crossings = 0;
  let length = 0;
  segments.forEach(({ start, end, wire }, index) => {
    length += distance(start, end);
    for (const other of segments.slice(index + 1)) {
      if (other.wire === wire || (start.x === end.x) === (other.start.x === other.end.x)) continue;
      const vertical = start.x === end.x ? { start, end } : other;
      const horizontal = start.x === end.x ? other : { start, end };
      if (vertical.start.x > Math.min(horizontal.start.x, horizontal.end.x) &&
          vertical.start.x < Math.max(horizontal.start.x, horizontal.end.x) &&
          horizontal.start.y > Math.min(vertical.start.y, vertical.end.y) &&
          horizontal.start.y < Math.max(vertical.start.y, vertical.end.y)) crossings++;
    }
  });
  return [routing.unrouted.length, crossings, paths.reduce((sum, path) => sum + path.length - 2, 0), length];
}

function improves(candidate: number[], current: number[]): boolean {
  const first = candidate.findIndex((value, index) => value !== current[index]);
  return first !== -1 && candidate[first] < current[first];
}

export function optimizeDrawing(drawing: Drawing, current: Routing): Routing {
  let best = current;
  let score = routingScore(best);
  const wires = drawing.topology.wires;
  // Try different allocation orders. Hard constraints apply to every candidate.
  const orders = [[...wires].reverse(), [...wires].sort((a, b) => a.id.localeCompare(b.id))];
  for (const order of orders) {
    const candidate = routeDrawing(drawing, order);
    const candidateScore = routingScore(candidate);
    if (improves(candidateScore, score)) {
      best = candidate;
      score = candidateScore;
    }
  }
  return best;
}

function componentBoxes(drawing: Drawing): [string, Box][] {
  return drawing.topology.components.flatMap((component): [string, Box][] => {
    const position = drawing.positions[component.id];
    if (!position) return [];
    const { x, y, rotation, span } = position;
    const vertical = rotation % 180 !== 0;
    const halfLength = (span ? span / 2 : terminalOffsets[component.kind] ?? 29) + 4;
    const w = vertical ? 22 : halfLength, h = vertical ? halfLength : 22;
    return [[component.id, { left: x - w, right: x + w, top: y - h, bottom: y + h }]];
  });
}

export function clearGeometry(drawing: Drawing): boolean {
  const boxes = componentBoxes(drawing);
  return boxes.every(([, box], i) =>
    box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom &&
    !boxes.slice(i + 1).some(([, other]) =>
      box.left <= other.right && other.left <= box.right && box.top <= other.bottom && other.top <= box.bottom) &&
    !Object.values(drawing.junctionPositions).some(point => contains(box, point)));
}

export function routeDrawing(
  drawing: Drawing, wires = drawing.topology.wires, reuse?: Routing,
): Routing {
  const ports = drawingPorts(drawing);
  const obstacles = componentBoxes(drawing);
  function obstaclesFor(from: string, to: string) {
    const junctions = drawing.topology.junctions.flatMap((id): [string, Box][] => {
      const p = drawing.junctionPositions[id];
      if (!p || id === from || id === to) return [];
      return [[id, { left: p.x - 2, right: p.x + 2, top: p.y - 2, bottom: p.y + 2 }]];
    });
    return [...obstacles, ...junctions];
  }
  const paths: Record<string, Point[]> = Object.create(null);
  const unrouted: string[] = [];
  // Reserve unaffected wires first. Moving a part can only invalidate paths at
  // changed endpoints or through its new clearance box.
  for (const wire of wires) {
    const path = reuse?.paths[wire.id];
    const from = ports.get(wire.from), to = ports.get(wire.to);
    if (!path || !from || !to || !equal(path[0], from.pin) || !equal(path.at(-1)!, to.pin)) continue;
    if (path.some((end, i) => i > 0 && obstaclesFor(wire.from, wire.to).some(([id, box]) =>
      !(i === 1 && id === from.owner) && !(i === path.length - 1 && id === to.owner) &&
      intersects(box, path[i - 1], end)))) continue;
    paths[wire.id] = path;
  }
  for (const wire of wires) {
    if (paths[wire.id]) continue;
    const from = ports.get(wire.from), to = ports.get(wire.to);
    const points = from && to && contains(bounds, from.escape) && contains(bounds, to.escape)
      ? route(from, to, obstaclesFor(wire.from, wire.to), Object.values(paths)) : null;
    if (points) paths[wire.id] = points;
    else unrouted.push(wire.id);
  }
  return { paths, unrouted };
}


export function optimizeLayout(drawing: Drawing, routing: Routing, grid: number): { drawing: Drawing; routing: Routing } {
  const wires = drawing.topology.wires;
  if (!wires.length || wires.length > 48) return { drawing, routing };
  const moves = [[grid, 0], [-grid, 0], [0, grid], [0, -grid]];
  let best = { drawing, routing: optimizeDrawing(drawing, routing) };
  const evaluate = (candidate: Drawing, routes: Routing) => {
    const score = routingScore(routes);
    let displacement = 0, crowding = 0;
    const positions = Object.entries(candidate.positions);
    positions.forEach(([id, p], index) => {
      displacement += distance(p, drawing.positions[id]);
      for (const [, other] of positions.slice(index + 1)) {
        crowding += Math.max(0, 110 - distance(p, other));
      }
    });
    return [score[0], score[1], score[2], score[3] + displacement + crowding];
  };
  let bestScore = evaluate(best.drawing, best.routing);
  const movable = drawing.topology.components.filter(item => !drawing.positions[item.id].pinned).slice(0, 8);
  for (const item of movable) {
    const p = drawing.positions[item.id];
    for (const [dx, dy] of moves) {
      const candidate = { ...drawing, positions: { ...drawing.positions, [item.id]: { ...p, x: p.x + dx, y: p.y + dy } } };
      if (p.x + dx < 40 || p.x + dx > 500 || p.y + dy < 40 || p.y + dy > 320 || !clearGeometry(candidate)) continue;
      const planned = routeDrawing(candidate, wires, best.routing);
      const score = evaluate(candidate, planned);
      if (improves(score, bestScore)) {
        best = { drawing: candidate, routing: planned };
        bestScore = score;
      }
    }
  }
  return best;
}
