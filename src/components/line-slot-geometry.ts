import type { SchematicGeometry } from "../circuit/schematic-geometry";
import type { Point } from "../circuit/topology-layout";
import type { TopologySlot } from "../circuit/topology-slots";
import type { CircuitComponent, CircuitTopology, CircuitWire } from "../circuit/topology";
import type { LineLayout } from "./line-experiment-layout";

type Axis = "x" | "y";
type Placement = { point: Point; vertical?: boolean; path?: readonly Point[] };
type OpenWireDrawing = { wire: CircuitWire; points: readonly Point[] };

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

export function geometryAfterInsertion(layout: LineLayout, before: CircuitTopology, after: CircuitTopology,
  slot: TopologySlot, part: CircuitComponent, proposed?: Placement, opened: readonly OpenWireDrawing[] = []): SchematicGeometry {
  const pins = Object.fromEntries(layout.endpoints);
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
    // A cut can cross an unrelated parallel branch. Move a whole device
    // together so changing another wire never stretches its two leads.
    for (const device of before.components) {
      if (device.kind === "port") continue;
      const [a, b] = device.terminals.map(id => beforeMove[id]);
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
  let newPathA: Point[] = [];
  let newPathB: Point[] = [];
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
    const vertical = proposed?.vertical ?? Math.abs(first.y - last.y) > Math.abs(first.x - last.x);
    const axis: Axis = vertical ? "y" : "x";
    const normal: Axis = vertical ? "x" : "y";
    const offset = slot.kind === "parallel" && slot.side === "left"
      ? Math.min(first[normal], last[normal]) - 86 : Math.max(first[normal], last[normal]) + 86;
    const center = proposed?.point ?? { ...midpoint(first, last), [normal]: offset };
    let at = { ...center, x: Math.max(vertical ? 35 : 65, center.x), y: Math.max(vertical ? 65 : 35, center.y) };
    // Keep a new branch clear of existing symbols and their labels.
    while (layout.components.some(existing => before.components.find(c => c.id === existing.id)?.kind !== "port" &&
      Math.abs(existing.x - at.x) < (vertical ? 53 : 105) && Math.abs(existing.y - at.y) < (vertical ? 80 : 42))) {
      at = { ...at, [normal]: at[normal] + 75 };
    }
    const direction = last[axis] >= first[axis] ? 1 : -1;
    pins[p] = { ...at, [axis]: at[axis] - 52 * direction };
    pins[q] = { ...at, [axis]: at[axis] + 52 * direction };
    newPathA = [{ ...pins[p], [axis]: first[axis] }];
    newPathB = [{ ...pins[q], [axis]: last[axis] }];
    if (proposed?.path && vertical) {
      const [upper, lower] = proposed.path;
      newPathA = [{ x: first.x, y: upper.y }, { x: at.x, y: upper.y }];
      newPathB = [{ x: at.x, y: lower.y }, { x: last.x, y: lower.y }];
    }
  }
  const bends: Record<string, Point[]> = {};
  for (const wire of after.wires) {
    if (wire.from === a && wire.to === p) bends[wire.id] = newPathA;
    else if (wire.from === q && wire.to === b) bends[wire.id] = newPathB;
    else bends[wire.id] = paths.get(wire.id)?.slice(1, -1) ?? [];
  }
  for (const { wire } of opened) bends[wire.id] = paths.get(wire.id)!.slice(1, -1);
  return { pins, bends, returnY };
}
