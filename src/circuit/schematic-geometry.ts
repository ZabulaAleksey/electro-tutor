import type { Point } from "./topology-layout";
import type { CircuitTopology } from "./topology";

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
