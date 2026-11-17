import type { Drawing, Placement, Point } from "../circuit/drawing";
import { createPowerDiagram } from "./diagram";
import { powerBranchEndpoints, type PowerNetwork } from "./network";

export function layoutPowerNetwork(network: PowerNetwork): string {
  const columns = Math.min(3, Math.max(1, network.buses.length));
  const board: Drawing["board"] = { width: 780, height: Math.max(360, 180 * Math.ceil(network.buses.length / columns)) };
  const busPositions: Record<string, Point> = Object.fromEntries(network.buses.map((bus, index) => [bus.id, {
    x: 155 + (index % columns) * 235, y: 90 + Math.floor(index / columns) * 180,
  }]));
  const placement: Record<string, Placement> = Object.create(null) as Record<string, Placement>;
  const occupied = new Map<string, number>();
  const offsetIndex = (key: string) => {
    const index = occupied.get(key) ?? 0;
    occupied.set(key, index + 1);
    return index;
  };
  for (const element of network.elements) {
    if (element.kind === "source" || element.kind === "load") {
      const bus = busPositions[element.busId];
      const index = offsetIndex(element.kind + ":" + element.busId);
      const dy = element.kind === "source" ? -43 : 43;
      placement[element.id] = { x: bus.x + (index % 5) * 23, y: bus.y + dy, rotation: dy > 0 ? 90 : 270 };
      continue;
    }
    const [first, second] = powerBranchEndpoints(element);
    const a = busPositions[first];
    const b = busPositions[second];
    const index = offsetIndex([first, second].sort().join(":"));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.hypot(dx, dy) || 1;
    const correction = Math.abs(dx) >= 400 && Math.abs(dy) < 20 ? 38 : 0;
    const offset = (index % 2 === 0 ? 1 : -1) * (Math.ceil(index / 2) * 26 + correction);
    const rotation = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 180) : (dy > 0 ? 90 : 270);
    const x = (a.x + b.x) / 2 - offset * dy / distance;
    const y = (a.y + b.y) / 2 + offset * dx / distance;
    placement[element.id] = { x: Math.min(board.width - 40, Math.max(40, x)), y: Math.min(board.height - 40, Math.max(40, y)), rotation };
  }
  return createPowerDiagram(network, placement, busPositions, board);
}
