import { canPlace, defaultBoard, placeComponent, wireDrawing, type Drawing, type PartKind, type Point } from "./drawing";
import { clearGeometry, drawingPorts, routeDrawing, type Routing } from "./routing";
import { parallelTopologyKey, resolveParallelRegions, type ParallelRegion } from "./parallel-regions";

export type ParallelAttachmentPlan =
  | { ok: true; drawing: Drawing; routing: Routing; componentId: string }
  | { ok: false; reason: string };

/** Pure, bounded planning. Source geometry, adapter data and topology are retained. */
export function planParallelAttachment(drawing: Drawing, routing: Routing, region: ParallelRegion, kind: PartKind): ParallelAttachmentPlan {
  const topology = drawing.topology;
  if (region.sourceKey !== parallelTopologyKey(topology)) return { ok: false, reason: "stale-region" };
  const candidates = resolveParallelRegions(topology, ...region.boundaries);
  if (!candidates.some(candidate => candidate.componentIds.length === region.componentIds.length &&
      candidate.componentIds.every(id => region.componentIds.includes(id)))) return { ok: false, reason: "unsupported-region" };
  if (topology.components.length >= 100 || topology.wires.length > 126) return { ok: false, reason: "document-limit" };
  const ports = drawingPorts(drawing);
  const a = ports.get(region.boundaries[0])?.pin, b = ports.get(region.boundaries[1])?.pin;
  if (!a || !b) return { ok: false, reason: "missing-boundary-geometry" };
  const board = drawing.board ?? defaultBoard;
  const members = region.componentIds.map(id => drawing.positions[id]);
  const center = { x: Math.round((a.x + b.x) / 20) * 10, y: Math.round((a.y + b.y) / 20) * 10 };
  const right = Math.max(...members.map(p => p.x)) + 120, bottom = Math.max(...members.map(p => p.y)) + 120;
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const rotation = horizontal ? b.x >= a.x ? 0 : 180 : b.y >= a.y ? 90 : 270;
  const boards = [board, { width: board.width, height: Math.min(8192, Math.max(board.height, bottom + 100)) },
    { width: Math.min(4096, Math.max(board.width, right + 100)), height: board.height },
    { width: Math.min(4096, board.width + 320), height: Math.min(8192, board.height + 320) }];
  const tried = new Set<string>();
  for (const size of boards) {
    const key = `${size.width}:${size.height}`;
    if (tried.has(key)) continue;
    tried.add(key);
    const expanded = size === board ? drawing : { ...drawing, board: size };
    const points: Point[] = horizontal
      ? [{ x: center.x, y: bottom }, { x: center.x, y: center.y - 120 }]
      : [{ x: right, y: center.y }, { x: center.x - 120, y: center.y }];
    points.push({ x: center.x, y: bottom + 100 }, { x: right, y: center.y },
      { x: 90, y: 70 }, { x: size.width - 90, y: 70 },
      { x: 90, y: size.height - 70 }, { x: size.width - 90, y: size.height - 70 });
    for (const point of points) {
      if (point.x < 70 || point.y < 70 || point.x > size.width - 70 || point.y > size.height - 70 || !canPlace(expanded, point)) continue;
      try {
        const placed = placeComponent(expanded, kind, point);
        const part = placed.topology.components.at(-1)!;
        const oriented = { ...placed, positions: { ...placed.positions, [part.id]: { ...placed.positions[part.id], rotation } } };
        const next = wireDrawing(wireDrawing(oriented, region.boundaries[0], part.terminals[0]), part.terminals[1], region.boundaries[1]);
        if (!clearGeometry(next)) continue;
        const nextRouting = routeDrawing(next, next.topology.wires, routing);
        if (!nextRouting.unrouted.length) return { ok: true, drawing: next, routing: nextRouting, componentId: part.id };
      } catch { /* A failed lane has no side effects. Try the next bounded lane. */ }
    }
  }
  return { ok: false, reason: "no-routable-placement" };
}
