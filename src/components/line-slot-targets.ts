import { createCrossSlot, type TopologySlot } from "../circuit/topology-slots";
import type { TopologyLabDocument } from "../circuit/topology-session";
import type { Point } from "../circuit/topology-layout";
import { wireTarget, type LineLayout } from "./line-experiment-layout";

type ParallelSlot = Extract<TopologySlot, { kind: "parallel" }>;
type LcAttachments = { terminals: readonly string[]; membership: ReadonlyMap<string, number> };
export type DirectTarget = {
  slot: TopologySlot; point: Point; vertical: boolean; path?: readonly Point[]; netPair?: string; wholePort?: boolean;
};

function pairKey([first, second]: readonly string[], membership: ReadonlyMap<string, number>) {
  const a = membership.get(first), b = membership.get(second);
  if (a === undefined || b === undefined || a === b) return;
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function distinctLcParallelSlots(slots: readonly ParallelSlot[], membership: ReadonlyMap<string, number>) {
  const unique = new Map<string, ParallelSlot>();
  for (const slot of slots) {
    const key = pairKey(slot.boundaries, membership);
    if (key !== undefined && !unique.has(key)) unique.set(key, slot);
  }
  return [...unique.values()];
}

export function directTargets(document: TopologyLabDocument, diagram: LineLayout,
  paths: readonly ParallelSlot[], near: string, lc?: LcAttachments): DirectTarget[] {
  const result: DirectTarget[] = [];
  const positions = new Map(diagram.components.map(p => [p.id, p]));
  const selected = paths.length > 24 ? paths.filter(s => s.componentIds.length === 1 ||
    (near && (s.componentIds[0] === near || s.componentIds.at(-1) === near))) : paths;
  const external = lc && pairKey(lc.terminals, lc.membership);
  const spans = lc ? distinctLcParallelSlots(selected, lc.membership) : selected;
  for (const slot of lc || diagram.returnY === undefined ? spans : []) {
    const netPair = lc && pairKey(slot.boundaries, lc.membership);
    if (netPair !== undefined && netPair === external) continue;
    const [a, b] = slot.boundaries.map(key => diagram.endpoints.get(key));
    if (!a || !b) continue;
    const members = slot.componentIds.map(id => positions.get(id)!);
    const spreadX = Math.abs(a.x - b.x), spreadY = Math.abs(a.y - b.y);
    const vertical = spreadY > spreadX;
    // Longer spans occupy more distant rows. For a folded chain, highlight the
    // actual terminals so the screen position cannot change the chosen path.
    const layer = 68 * slot.componentIds.length;
    const x = vertical ? Math.max(a.x, b.x) + layer : (a.x + b.x) / 2;
    const y = vertical ? (a.y + b.y) / 2 : Math.min(...members.map(p => p.y)) - layer;
    const point = { x, y: y >= 24 ? y : Math.max(...members.map(p => p.y)) + layer };
    result.push({ slot, point, vertical, netPair });
  }
  if (lc) {
    const [from, to] = lc.terminals;
    const a = diagram.endpoints.get(from), b = diagram.endpoints.get(to);
    if (external && a && b) {
      const slot = createCrossSlot(document.topology, from, to, document.observedEndpoints);
      const vertical = Math.abs(a.y - b.y) > Math.abs(a.x - b.x);
      const point = vertical
        ? { x: Math.max(a.x, b.x) + 86, y: (a.y + b.y) / 2 }
        : { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) >= 110 ? Math.min(a.y, b.y) - 86 : Math.max(a.y, b.y) + 86 };
      result.push({ slot, point, vertical, netPair: external, wholePort: true });
    }
    return result;
  }
  if (diagram.returnY !== undefined) {
    const wires = new Map(document.topology.wires.map(w => [w.id, w]));
    const returnY = diagram.returnY;
    const hasLowerRail = (points: readonly Point[], x?: number) => points.some((point, index) => {
      const previous = points[index - 1];
      return previous?.y === returnY && point.y === returnY && (x === undefined
        ? Math.abs(point.x - previous.x) > 100
        : x >= Math.min(point.x, previous.x) && x <= Math.max(point.x, previous.x));
    });
    const sections = document.topology.components.filter(part => part.kind === "line");
    const pairedReturns = new Map(sections.filter(part => part.terminals.length === 4)
      .flatMap(({ terminals: [a, b, returnIn, returnOut] }) => [[a, returnIn], [b, returnOut]]));
    const legacyRail = !pairedReturns.size ? diagram.wires.find(wire => hasLowerRail(wire.points)) : undefined;
    const signalPins = new Set(sections.flatMap(part => part.terminals.slice(0, 2)));
    for (const line of diagram.wires) {
      const wire = wires.get(line.id);
      if (!wire || !(signalPins.has(wire.from) || signalPins.has(wire.to))) continue;
      const location = wireTarget(line.points);
      if (location.y >= returnY - 80) continue;
      const paired = pairedReturns.get(wire.from) ?? pairedReturns.get(wire.to);
      const physicalRail = paired && diagram.wires.find(candidate => {
        const connection = wires.get(candidate.id);
        return connection && (connection.from === paired || connection.to === paired) && hasLowerRail(candidate.points, location.x);
      });
      const bottom = physicalRail || legacyRail;
      if (!bottom || line === bottom) continue;
      const from = wire.from, to = wires.get(bottom.id)!.from;
      try {
        const slot = createCrossSlot(document.topology, from, to, document.observedEndpoints);
        const point = { x: location.x, y: (location.y + diagram.returnY) / 2 };
        result.push({ slot, point, vertical: true, path: [location, { x: location.x, y: diagram.returnY }] });
      } catch { /* Overlapping conductors of the same net have no insertion target. */ }
    }
  }
  return result;
}
