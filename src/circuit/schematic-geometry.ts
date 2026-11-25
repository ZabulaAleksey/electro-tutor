import type { Point } from "./topology-layout";
import type { CircuitTopology, CircuitWire } from "./topology";

export type SchematicGeometry = Readonly<{
  pins: Readonly<Record<string, Point>>;
  bends: Readonly<Record<string, readonly Point[]>>;
  returnY?: number;
}>;

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function coordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100_000;
}

function point(value: unknown): Point {
  if (!record(value) || !coordinate(value.x) || !coordinate(value.y)) throw Error("invalid-schematic-point");
  return Object.freeze({ x: value.x, y: value.y });
}

export function readSchematicGeometry(value: unknown, topology: CircuitTopology): SchematicGeometry {
  if (!record(value) || !record(value.pins) || !record(value.bends)
    || (value.returnY !== undefined && !coordinate(value.returnY))) throw Error("invalid-schematic-geometry");
  const endpoints = new Set([...topology.junctions, ...topology.components.flatMap(part => part.terminals)]);
  const wires = new Set(topology.wires.map(wire => wire.id));
  const pins = Object.fromEntries(Object.entries(value.pins).filter(([id]) => endpoints.has(id)).map(([id, p]) => [id, point(p)]));
  const bends = Object.fromEntries(Object.entries(value.bends).filter(([id]) => wires.has(id)).map(([id, path]) => {
    if (!Array.isArray(path) || path.length > 64) throw Error("invalid-wire-path");
    return [id, Object.freeze(path.map(point))];
  }));
  return Object.freeze({ pins: Object.freeze(pins), bends: Object.freeze(bends),
    ...(value.returnY === undefined ? {} : { returnY: value.returnY }) });
}

type GeometryLink = { endpoint: string; points: readonly Point[] };

function compactOrthogonalPath(points: readonly Point[]): Point[] {
  const result: Point[] = [points[0]];
  function append(point: Point) {
    const previous = result.at(-1)!;
    if (previous.x === point.x && previous.y === point.y) return;
    const earlier = result.at(-2);
    if (earlier && (earlier.x === previous.x && previous.x === point.x
      || earlier.y === previous.y && previous.y === point.y)) result.pop();
    result.push(point);
  }
  for (const [index, current] of points.slice(1).entries()) {
    const previous = points[index];
    if (previous.x !== current.x && previous.y !== current.y) append({ x: current.x, y: previous.y });
    append(current);
  }
  return result;
}

function originalRoute(graph: ReadonlyMap<string, GeometryLink[]>, from: string, to: string): readonly Point[] | undefined {
  const pending = [from];
  const visited = new Set(pending);
  const leadingTo = new Map<string, { from: string; points: readonly Point[] }>();
  for (let index = 0; index < pending.length && !visited.has(to); index++) {
    const origin = pending[index];
    for (const { endpoint, points } of graph.get(origin) ?? []) {
      if (visited.has(endpoint)) continue;
      leadingTo.set(endpoint, { from: origin, points });
      visited.add(endpoint);
      pending.push(endpoint);
    }
  }
  if (!leadingTo.has(to)) return;
  const segments: (readonly Point[])[] = [];
  let endpoint = to;
  while (endpoint !== from) {
    const previous = leadingTo.get(endpoint)!;
    segments.push(previous.points);
    endpoint = previous.from;
  }
  return segments.reverse().flat();
}

/** Keep surviving pin and wire geometry. New connections follow the old
 * conductor routes, with a link across the old device only for explicit bypass. */
export function geometryAfterRemoval(
  geometry: SchematicGeometry,
  activeBefore: readonly CircuitWire[],
  openedBefore: readonly CircuitWire[],
  drawingAfter: readonly CircuitWire[],
  bypassTerminals?: readonly string[],
): SchematicGeometry {
  const { pins, bends, returnY } = geometry;
  const previous = new Map([...activeBefore, ...openedBefore].map(wire => [wire.id, wire]));
  const graph = new Map<string, GeometryLink[]>();
  function link(from: string, to: string, turns: readonly Point[]) {
    if (!Object.hasOwn(pins, from) || !Object.hasOwn(pins, to)) return;
    const points = compactOrthogonalPath([pins[from], ...turns, pins[to]]);
    graph.set(from, [...graph.get(from) ?? [], { endpoint: to, points }]);
    graph.set(to, [...graph.get(to) ?? [], { endpoint: from, points: points.toReversed() }]);
  }
  for (const wire of activeBefore) {
    link(wire.from, wire.to, Object.hasOwn(bends, wire.id) ? bends[wire.id] : []);
  }
  if (bypassTerminals) link(bypassTerminals[0], bypassTerminals[1], []);

  const byWire = new Map<string, readonly Point[]>();
  for (const { id, from, to } of drawingAfter) {
    const old = previous.get(id);
    if (old?.from === from && old.to === to) {
      if (Object.hasOwn(bends, id)) byWire.set(id, bends[id]);
      continue;
    }
    const path = originalRoute(graph, from, to);
    if (!path) continue;
    const turns = compactOrthogonalPath(path).slice(1, -1);
    if (turns.length <= 64) byWire.set(id, turns);
  }
  return { pins, bends: Object.fromEntries(byWire), returnY };
}

/** Make room along the existing line axis; all connections already on its
 * outlet move to the outlet of the appended section in the electrical graph. */
export function appendSectionGeometry(geometry: SchematicGeometry | undefined, inlet: string, outlet: string,
  terminals: readonly string[], topology: CircuitTopology, returnOutlet?: string): SchematicGeometry | undefined {
  if (!geometry) return;
  const origin = geometry.pins[outlet], other = geometry.pins[inlet];
  if (!origin || !other) return;
  const axis = origin.x === other.x ? "y" : "x";
  const direction = origin[axis] < other[axis] ? -1 : 1;
  function shift(p: Point): Point {
    return (p[axis] - origin[axis]) * direction > 0 ? { ...p, [axis]: p[axis] + 148 * direction } : p;
  }
  const pins = Object.fromEntries(Object.entries(geometry.pins).map(([id, p]) => [id, shift(p)]));
  pins[terminals[0]] = { ...origin, [axis]: origin[axis] + 24 * direction };
  pins[terminals[1]] = { ...origin, [axis]: origin[axis] + 128 * direction };
  const returnOrigin = returnOutlet === undefined ? undefined : geometry.pins[returnOutlet];
  if (returnOrigin) {
    pins[terminals[2]] = { ...returnOrigin, [axis]: returnOrigin[axis] + 24 * direction };
    pins[terminals[3]] = { ...returnOrigin, [axis]: returnOrigin[axis] + 128 * direction };
  }
  const bends: Record<string, Point[]> = {};
  for (const wire of topology.wires) {
    const turns = (geometry.bends[wire.id] ?? []).map(shift);
    const route = [pins[wire.from], ...turns, pins[wire.to]];
    const result: Point[] = [];
    for (let i = 1; i < route.length; i++) {
      const prev = route[i - 1], next = route[i];
      if (!prev || !next) continue;
      if (prev.x !== next.x && prev.y !== next.y) result.push({ x: next.x, y: prev.y });
      if (i < route.length - 1) result.push(next);
    }
    bends[wire.id] = result;
  }
  const returnY = geometry.returnY === undefined ? undefined : shift({ x: 0, y: geometry.returnY }).y;
  return { pins, bends, returnY };
}
