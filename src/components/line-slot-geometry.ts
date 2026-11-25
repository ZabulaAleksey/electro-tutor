import type { SchematicGeometry } from "../circuit/schematic-geometry";
import type { Point } from "../circuit/topology-layout";
import type { TopologySlot } from "../circuit/topology-slots";
import { netlist, type CircuitComponent, type CircuitTopology, type CircuitWire } from "../circuit/topology";
import { positiveOverlap, routeOrthogonalWire } from "../circuit/routing";
import type { LineLayout } from "./line-experiment-layout";

type Axis = "x" | "y";
type Placement = { point: Point; vertical?: boolean; path?: readonly Point[] };
type OpenWireDrawing = { wire: CircuitWire; points: readonly Point[] };
type Box = Parameters<typeof routeOrthogonalWire>[4];

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const touches = (box: Box, a: Point, b = a) =>
  Math.min(a.x, b.x) <= box.right && Math.max(a.x, b.x) >= box.left &&
  Math.min(a.y, b.y) <= box.bottom && Math.max(a.y, b.y) >= box.top;

function bodyBounds(pins: Record<string, Point>, part: CircuitComponent): Box {
  const [a, b] = part.terminals.map(id => pins[id]);
  const along: Axis = a.y === b.y ? "x" : "y";
  const across: Axis = along === "x" ? "y" : "x";
  const ret = part.kind === "line" && part.terminals.length === 4 ? pins[part.terminals[2]][across] : undefined;
  const range = {
    [along]: [Math.min(a[along], b[along]) + 2, Math.max(a[along], b[along]) - 2],
    [across]: ret === undefined ? [a[across] - 16, a[across] + 16]
      : [Math.min(a[across], ret) - 2, Math.max(a[across], ret) + 2],
  };
  return { left: range.x[0], right: range.x[1], top: range.y[0], bottom: range.y[1] };
}

function routeConflictingWires(topology: CircuitTopology, pins: Record<string, Point>,
  bends: Record<string, Point[]>, oldWires: ReadonlyMap<string, CircuitWire>) {
  let complete = true;
  const membership = new Map(netlist(topology).flatMap((net, index) => net.map(id => [id, index] as const)));
  const ports = new Map<string, Parameters<typeof routeOrthogonalWire>[0]>(
    topology.junctions.map(id => [id, { pin: pins[id], escape: pins[id] }]));
  const boxes: Parameters<typeof routeOrthogonalWire>[2] = [];
  for (const part of topology.components) {
    // An LC measurement port marks two distinct points. There is no device
    // or conductor between those points for routing to avoid.
    if (part.kind === "port") {
      part.terminals.forEach(id => ports.set(id, { pin: pins[id], escape: pins[id] }));
      continue;
    }
    const [a, b] = part.terminals.map(id => pins[id]);
    const along: Axis = a.y === b.y ? "x" : "y";
    const sign = Math.sign(b[along] - a[along]);
    part.terminals.forEach((id, index) => {
      const pin = pins[id];
      const escape = { ...pin, [along]: pin[along] + (index % 2 ? sign : -sign) * 6 };
      ports.set(id, { pin, escape, owner: part.id });
    });
    boxes.push([part.id, bodyBounds(pins, part)]);
  }
  const original = ({ id, from, to }: CircuitWire) => oldWires.get(id)?.from === from && oldWires.get(id)?.to === to;
  const paths: { net: number; path: Point[] }[] = [];
  const points = [...Object.values(pins), ...Object.values(bends).flat()];
  const bounds = { left: 1, top: 1, right: Math.max(...points.map(p => p.x)) + 88, bottom: Math.max(...points.map(p => p.y)) + 88 };
  // The rails can share a trace within one net. Reserve surviving routes
  // before routing added wires, so a new branch yields to the old layout.
  const order = topology.wires.toSorted((a, b) => Number(original(b)) - Number(original(a))
    || (a.id < b.id ? -1 : a.id === b.id ? 0 : 1));
  for (const { id, from, to } of order) {
    const net = membership.get(from)!;
    let path = [pins[from], ...bends[id], pins[to]];
    const remaining = paths.filter(wire => wire.net !== net).map(wire => wire.path);
    const conflict = path.slice(1).some((end, index) => {
      const start = path[index];
      return boxes.some(([, box]) => touches(box, start, end))
        || remaining.some(other => other.slice(1).some((point, i) => positiveOverlap(start, end, other[i], point)));
    });
    if (conflict) {
      const a = ports.get(from)!, b = ports.get(to)!;
      const detour = routeOrthogonalWire(a, b, boxes, remaining, bounds)
        ?? routeOrthogonalWire({ ...a, escape: a.pin }, { ...b, escape: b.pin }, boxes, remaining, bounds);
      if (detour) {
        path = detour;
        bends[id] = path.slice(1, -1);
      } else complete = false;
    }
    paths.push({ net, path });
  }
  return complete;
}

function lcBranchCenter(first: Point, last: Point, axis: Axis, side: number, topology: CircuitTopology,
  pins: Record<string, Point>, paths: ReadonlyMap<string, Point[]>) {
  const normal: Axis = axis === "x" ? "y" : "x";
  const symbol = { x: axis === "x" ? 58 : 21, y: axis === "x" ? 21 : 58 };
  const center = midpoint(first, last);
  const obstacles = topology.components.filter(part => part.kind !== "port").map(part => bodyBounds(pins, part));
  for (const path of paths.values()) {
    path.slice(1).forEach((end, index) => {
      const start = path[index];
      obstacles.push({ left: Math.min(start.x, end.x), right: Math.max(start.x, end.x),
        top: Math.min(start.y, end.y), bottom: Math.max(start.y, end.y) });
    });
  }
  const lo = normal === "x" ? "left" : "top";
  const hi = normal === "x" ? "right" : "bottom";
  const axisPosition = Math.max(symbol[axis] + 6, center[axis]);
  // Walk the nearest clear lane on the chosen side. A new branch must not
  // vacate existing paths; if there is no room on one side, use the other.
  function findLane(direction: number) {
    const edge = direction < 0 ? Math.min(first[normal], last[normal]) : Math.max(first[normal], last[normal]);
    let position = direction < 0 ? edge - 64 : Math.max(symbol[normal] + 6, edge + 64);
    while (position >= symbol[normal] + 6) {
      const candidate = { ...center, [axis]: axisPosition, [normal]: position };
      const tl = { x: candidate.x - symbol.x, y: candidate.y - symbol.y };
      const br = { x: candidate.x + symbol.x, y: candidate.y + symbol.y };
      const occupied = obstacles.filter(box => touches(box, tl, br));
      if (!occupied.length) return candidate;
      position = direction < 0
        ? Math.min(...occupied.map(box => box[lo])) - symbol[normal] - 6
        : Math.max(...occupied.map(box => box[hi])) + symbol[normal] + 6;
    }
  }
  return findLane(side) ?? findLane(1)!;
}

export function geometryAfterInsertion(layout: LineLayout, before: CircuitTopology, after: CircuitTopology,
  slot: TopologySlot, part: CircuitComponent, proposed?: Placement, opened: readonly OpenWireDrawing[] = []): SchematicGeometry {
  const pins = Object.fromEntries(layout.endpoints);
  const hasSeparateReturn = before.components.some(device => device.kind === "line" && device.terminals.length === 4);
  const isLc = before.components.some(device => device.kind === "port")
    && before.components.every(device => device.kind === "port" || device.kind === "l" || device.kind === "c");
  const paths = new Map<string, Point[]>();
  const oldWires = new Map(before.wires.map(w => [w.id, w]));
  for (const wire of layout.wires) {
    const from = pins[oldWires.get(wire.id)!.from];
    paths.set(wire.id, same(wire.points[0], from) ? [...wire.points] : [...wire.points].reverse());
  }
  for (const { wire, points } of opened) {
    oldWires.set(wire.id, wire);
    paths.set(wire.id, [...points]);
  }
  let returnY = layout.returnY;
  function shift(axis: Axis, cut: number, distance: number) {
    const move = (p: Point): Point => p[axis] > cut ? { ...p, [axis]: p[axis] + distance } : p;
    const beforeMove = { ...pins };
    for (const id of Object.keys(pins)) pins[id] = move(pins[id]);
    // Choose a single translation from the symbol's primary pins. All pins
    // of a four-terminal line follow, including those on its return rail.
    for (const device of before.components) {
      if (device.kind === "port") continue;
      const a = beforeMove[device.terminals[0]], b = beforeMove[device.terminals[1]];
      const delta = midpoint(a, b)[axis] > cut ? distance : 0;
      for (const key of device.terminals) {
        const point = beforeMove[key];
        pins[key] = { ...point, [axis]: point[axis] + delta };
      }
    }
    for (const [id, points] of paths) {
      const wire = oldWires.get(id)!;
      const moved = points.map(move);
      moved[0] = pins[wire.from];
      moved[moved.length - 1] = pins[wire.to];
      paths.set(id, moved);
    }
    if (axis === "y" && returnY !== undefined && returnY > cut) returnY += distance;
  }
  const [a, b] = slot.boundaries;
  const [p, q] = part.terminals;
  const initialPaths = isLc ? new Map(paths) : undefined;
  let newPathA: Point[] = [];
  let newPathB: Point[] = [];
  function branch(at: Point, axis: Axis) {
    const direction = pins[b][axis] >= pins[a][axis] ? 1 : -1;
    pins[p] = { ...at, [axis]: at[axis] - 52 * direction };
    pins[q] = { ...at, [axis]: at[axis] + 52 * direction };
    newPathA = [{ ...pins[p], [axis]: pins[a][axis] }];
    newPathB = [{ ...pins[q], [axis]: pins[b][axis] }];
  }
  if (slot.kind === "series") {
    const oldPath = paths.get(slot.wireId)!;
    let index = 0;
    let length = -1;
    for (let i = 0; i + 1 < oldPath.length; i++) {
      const size = Math.abs(oldPath[i].x - oldPath[i + 1].x) + Math.abs(oldPath[i].y - oldPath[i + 1].y);
      if (size > length) { length = size; index = i; }
    }
    const start = oldPath[index], end = oldPath[index + 1];
    const axis: Axis = start.x === end.x ? "y" : "x";
    if (length < 146) shift(axis, midpoint(start, end)[axis], 146 - length);
    const path = paths.get(slot.wireId)!;
    const center = midpoint(path[index], path[index + 1]);
    const direction = end[axis] >= start[axis] ? 1 : -1;
    pins[p] = { ...center, [axis]: center[axis] - 52 * direction };
    pins[q] = { ...center, [axis]: center[axis] + 52 * direction };
    newPathA = path.slice(1, index + 1);
    newPathB = path.slice(index + 1, -1);
  } else {
    const first = pins[a], last = pins[b];
    const vertical = (!isLc ? proposed?.vertical : undefined) ?? Math.abs(first.y - last.y) > Math.abs(first.x - last.x);
    const axis: Axis = vertical ? "y" : "x";
    const normal: Axis = vertical ? "x" : "y";
    const left = slot.kind === "parallel" && slot.side === "left";
    let at: Point;
    if (isLc) {
      at = lcBranchCenter(first, last, axis, left ? -1 : 1, before, pins, paths);
    } else {
      const offset = left ? Math.min(first[normal], last[normal]) - 86 : Math.max(first[normal], last[normal]) + 86;
      const center = proposed?.point ?? { ...midpoint(first, last), [normal]: offset };
      at = { ...center, x: Math.max(vertical ? 35 : 65, center.x), y: Math.max(vertical ? 65 : 35, center.y) };
      const physicalBodies = before.components.filter(part => part.kind === "line" && part.terminals.length === 4)
        .map(part => bodyBounds(pins, part));
      const radiusX = vertical ? 16 : 52, radiusY = vertical ? 52 : 16;
      const crossesLine = () => physicalBodies.some(box =>
        touches(box, { x: at.x - radiusX, y: at.y - radiusY }, { x: at.x + radiusX, y: at.y + radiusY }));
      // Keep a new branch clear of existing symbols and their labels.
      while (crossesLine() || layout.components.some(existing => before.components.find(c => c.id === existing.id)?.kind !== "port" &&
        Math.abs(existing.x - at.x) < (vertical ? 53 : 105) && Math.abs(existing.y - at.y) < (vertical ? 80 : 42))) {
        at = { ...at, [normal]: at[normal] + 75 };
      }
    }
    branch(at, axis);
    if (!isLc && proposed?.path && vertical) {
      const [upper, lower] = proposed.path;
      newPathA = [{ x: first.x, y: upper.y }, { x: at.x, y: upper.y }];
      newPathB = [{ x: at.x, y: lower.y }, { x: last.x, y: lower.y }];
    }
  }
  function orthogonalBends(wire: CircuitWire, turns: Point[]) {
    if (!hasSeparateReturn && !isLc) return turns;
    // Enlarging a slot can move its neighbours' elbows without moving a
    // line's complete body. Connect those displaced ends orthogonally.
    const path = [pins[wire.from], ...turns, pins[wire.to]];
    const result: Point[] = [];
    for (let index = 1; index < path.length; index++) {
      const previous = path[index - 1], point = path[index];
      if (previous.x !== point.x && previous.y !== point.y) result.push({ x: point.x, y: previous.y });
      if (index < path.length - 1) result.push(point);
    }
    return result;
  }
  function buildBends() {
    const bends: Record<string, Point[]> = {};
    for (const wire of after.wires) {
      const turns = wire.from === a && wire.to === p ? newPathA
        : wire.from === q && wire.to === b ? newPathB : paths.get(wire.id)?.slice(1, -1) ?? [];
      bends[wire.id] = orthogonalBends(wire, turns);
    }
    for (const { wire } of opened) bends[wire.id] = orthogonalBends(wire, paths.get(wire.id)!.slice(1, -1));
    return bends;
  }
  function collides() {
    const body = bodyBounds(pins, part);
    return before.components.some(existing => {
      if (existing.kind === "port") return false;
      const other = bodyBounds(pins, existing);
      return touches(body, { x: other.left, y: other.top }, { x: other.right, y: other.bottom });
    });
  }
  const bends = buildBends();
  const routed = !(hasSeparateReturn || isLc) || routeConflictingWires(after, pins, bends, oldWires);
  if (initialPaths && (!routed || collides())) {
    // Fitting a series symbol inline can block another branch which shares
    // that trace. Keep the same electrical cut and use an adjacent corridor.
    for (const [id, pin] of layout.endpoints) pins[id] = pin;
    for (const [id, path] of initialPaths) paths.set(id, path);
    const first = pins[a], last = pins[b];
    const preferredAxis: Axis = Math.abs(first.x - last.x) >= Math.abs(first.y - last.y) ? "x" : "y";
    for (const axis of [preferredAxis, preferredAxis === "x" ? "y" : "x"] as const) {
      for (const side of [1, -1]) {
        branch(lcBranchCenter(first, last, axis, side, before, pins, paths), axis);
        const alternative = buildBends();
        if (routeConflictingWires(after, pins, alternative, oldWires)) {
          return { pins, bends: alternative, returnY: layout.returnY };
        }
      }
    }
    throw Error("schematic-routes-unavailable");
  }
  return { pins, bends, returnY };
}
