import { createCrossSlot, type TopologySlot } from "../circuit/topology-slots";
import type { TopologyLabDocument } from "../circuit/topology-session";
import type { Point } from "../circuit/topology-layout";
import { wireTarget, type LineLayout } from "./line-experiment-layout";

export type DirectTarget = { slot: TopologySlot; point: Point; vertical: boolean; path?: readonly Point[] };

export function directTargets(document: TopologyLabDocument, diagram: LineLayout,
  paths: readonly Extract<TopologySlot, { kind: "parallel" }>[], near: string): DirectTarget[] {
  const result: DirectTarget[] = [];
  const positions = new Map(diagram.components.map(p => [p.id, p]));
  const selected = paths.length > 24 ? paths.filter(s => s.componentIds.length === 1 ||
    (near && (s.componentIds[0] === near || s.componentIds.at(-1) === near))) : paths;
  for (const slot of diagram.returnY === undefined ? selected : []) {
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
    result.push({ slot, point, vertical });
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
