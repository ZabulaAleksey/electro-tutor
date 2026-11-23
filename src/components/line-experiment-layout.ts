import { layoutTopology, type Point, type TopologyLayout } from "../circuit/topology-layout";
import type { TopologyLabDocument } from "../circuit/topology-session";
import { netlist, type CircuitComponent } from "../circuit/topology";

type Rotation = 0 | 90 | -90 | 180;
type LineLayout = TopologyLayout & {
  rotations: ReadonlyMap<string, Rotation>;
  returnY?: number;
  append: Point;
  appendEndpoint?: string;
};

const upper = 106;
const lower = 254;
const terminalOffset = 52;

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y;
}

function loopLayout({ topology }: TopologyLabDocument): LineLayout | undefined {
  // A simple source / line cascade / shunt loop has a conventional two-wire
  // drawing. Branched and disconnected graphs use the general topology layout.
  const membership = new Map(netlist(topology).flatMap((net, index) => net.map(id => [id, index] as const)));
  const components = topology.components;
  const source = components.find(part => part.kind === "current" || part.kind === "voltage");
  if (!source || topology.junctions.length || components.length < 3) return;
  const terminal = (part: CircuitComponent, index: number) => membership.get(part.terminals[index]);
  const inNet = terminal(source, 0);
  const returnNet = terminal(source, 1);
  if (inNet === returnNet) return;

  const path: Array<{ part: CircuitComponent; reversed: boolean }> = [];
  const visited = new Set([source.id]);
  let right = inNet;
  while (right !== returnNet) {
    const next = components.filter(part => !visited.has(part.id) && (terminal(part, 0) === right || terminal(part, 1) === right));
    if (next.length !== 1) return;
    const part = next[0];
    const reversed = terminal(part, 1) === right;
    path.push({ part, reversed });
    visited.add(part.id);
    right = terminal(part, reversed ? 0 : 1);
  }
  const loadEntry = path.at(-1);
  const upperPath = path.slice(0, -1);
  if (visited.size !== components.length || !loadEntry || !upperPath.some(entry => entry.part.kind === "line")
    || loadEntry.part.kind === "line" || upperPath.some(({ part }) => part.kind === "current" || part.kind === "voltage")) return;

  const firstX = 69;
  const load = loadEntry.part;
  const loadX = 150 + upperPath.length * 146;
  const middle = (upper + lower) / 2;
  const placements = [
    { id: source.id, x: firstX, y: middle },
    ...upperPath.map(({ part }, index) => ({ id: part.id, x: 176 + index * 146, y: upper })),
    { id: load.id, x: loadX, y: middle },
  ];
  const rotations = new Map<string, Rotation>([[source.id, 90], [load.id, loadEntry.reversed ? -90 : 90]]);
  const endpoints = new Map<string, Point>();
  function vertical(part: CircuitComponent, x: number, reversed: boolean) {
    endpoints.set(part.terminals[reversed ? 1 : 0], { x, y: middle - terminalOffset });
    endpoints.set(part.terminals[reversed ? 0 : 1], { x, y: middle + terminalOffset });
  }
  vertical(source, firstX, false);
  vertical(load, loadX, loadEntry.reversed);
  for (const [index, { part, reversed }] of upperPath.entries()) {
    const { x } = placements[index + 1];
    if (reversed) rotations.set(part.id, 180);
    endpoints.set(part.terminals[reversed ? 1 : 0], { x: x - terminalOffset, y: upper });
    endpoints.set(part.terminals[reversed ? 0 : 1], { x: x + terminalOffset, y: upper });
  }

  const wires = topology.wires.map(({ id, from, to }) => {
    const a = endpoints.get(from)!;
    const b = endpoints.get(to)!;
    const lane = membership.get(from) === returnNet ? lower : upper;
    const points = a.y === b.y && a.y === upper ? [a, b] : [a, { x: a.x, y: lane }, { x: b.x, y: lane }, b];
    return { id, points: points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1])) };
  });
  const anchors = new Map(placements.map(({ id, x, y }) =>
    [id, { left: { x, y: y - 60 }, right: { x, y: y + 60 } }] as const));
  const end = upperPath.findLast(({ part }) => part.kind === "line");
  return { width: loadX + 69, height: 294, returnY: lower, append: { x: loadX, y: 42 },
    appendEndpoint: end?.part.terminals[end.reversed ? 0 : 1],
    components: placements, junctions: [], wires, endpoints, anchors, rotations };
}

/** Walk the electrical chain from a to b. Each real wire keeps its insertion target. */
function seriesPortLayout({ topology }: TopologyLabDocument, port: CircuitComponent): LineLayout | undefined {
  type Edge = { id: string; end: string; device: boolean };
  const edges = new Map<string, Edge[]>();
  function connect(id: string, a: string, b: string, device: boolean) {
    edges.set(a, [...(edges.get(a) ?? []), { id, end: b, device }]);
    edges.set(b, [...(edges.get(b) ?? []), { id, end: a, device }]);
  }
  for (const { id, from, to } of topology.wires) connect(id, from, to, false);
  for (const part of topology.components) {
    if (part !== port) connect(part.id, part.terminals[0], part.terminals[1], true);
  }
  const endpoints = new Map<string, Point>();
  const wires = [];
  const components = [];
  const visited = new Set<string>();
  let endpoint = port.terminals[0];
  let x = 35;
  const y = 92;
  endpoints.set(endpoint, { x, y });
  while (endpoint !== port.terminals[1]) {
    const next = (edges.get(endpoint) ?? []).filter(edge => !visited.has(edge.id));
    if (next.length !== 1) return;
    const edge = next[0];
    visited.add(edge.id);
    const start = { x, y };
    x += edge.device ? 2 * terminalOffset : 46;
    if (edge.device) components.push({ id: edge.id, x: x - terminalOffset, y });
    else wires.push({ id: edge.id, points: [start, { x, y }] });
    endpoint = edge.end;
    endpoints.set(endpoint, { x, y });
  }
  if (visited.size !== topology.wires.length + topology.components.length - 1) return;
  const junctions = topology.junctions.map(id => ({ id, ...endpoints.get(id)! }));
  components.push({ id: port.id, x: 35, y });
  return { width: x + 35, height: 204, components, junctions, endpoints, wires,
    anchors: new Map(), rotations: new Map(), append: { x, y: 32 } };
}

export function layoutLineExperiment(document: TopologyLabDocument): LineLayout {
  const loop = loopLayout(document);
  if (loop) return loop;
  const port = document.topology.components.find(part => part.kind === "port");
  const chain = port && seriesPortLayout(document, port);
  if (chain) return chain;
  const layout = layoutTopology(document, port?.id);
  const kinds = new Map(document.topology.components.map(part => [part.id, part]));
  const last = layout.components.findLast(({ id }) => kinds.get(id)?.kind === "line");
  return { ...layout, width: Math.max(layout.width, 330), rotations: new Map(),
    append: { x: Math.max(layout.width, 330) - 40, y: 34 },
    appendEndpoint: last && kinds.get(last.id)?.terminals[1] };
}

export function wireTarget(points: readonly Point[]): Point {
  let longest = -1;
  let middle = points[0];
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    if (length > longest) {
      longest = length;
      middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return middle;
}

export type LcCanvasTarget = { id: string; points: readonly Point[] };
type LcCanvasMarker = { id: string; point: Point; anchor?: Point };

export function placeLcCanvasTargets(targets: readonly LcCanvasTarget[], width: number, height: number, scale: number, reserved: readonly Point[] = []) {
  // The buttons live in CSS pixels, even while the schematic is scaled.
  const pitch = 48 / scale;
  const edge = 24 / scale;
  const markers: LcCanvasMarker[] = [];
  let fieldHeight = height;

  function available({ x, y }: Point) {
    return x >= edge && x <= width - edge && y >= edge && y <= fieldHeight - edge
      && reserved.every(point => Math.abs(x - point.x) >= pitch || Math.abs(y - point.y) >= pitch)
      && markers.every(({ point }) => Math.abs(x - point.x) >= pitch || Math.abs(y - point.y) >= pitch);
  }

  function onWire(points: readonly Point[]) {
    const preferred = wireTarget(points);
    if (available(preferred)) return preferred;
    // Start at the middle of each segment, then try other positions on that wire.
    for (const [index, start] of points.slice(0, -1).entries()) {
      const end = points[index + 1];
      const length = Math.abs(start.x - end.x) + Math.abs(start.y - end.y);
      const steps = Math.max(1, Math.ceil(length / (pitch / 2)));
      for (let offset = 0; offset <= steps / 2; offset++) {
        for (const direction of offset ? [-1, 1] : [0]) {
          const fraction = .5 + direction * offset / steps;
          const point = { x: start.x + (end.x - start.x) * fraction, y: start.y + (end.y - start.y) * fraction };
          if (available(point)) return point;
        }
      }
    }
  }

  const nearOffsets = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const;
  function nextPoint(anchor: Point): Point {
    for (const radius of [pitch / 2, pitch, pitch * 1.5]) {
      for (const [dx, dy] of nearOffsets) {
        const point = { x: anchor.x + dx * radius, y: anchor.y + dy * radius };
        if (available(point)) return point;
      }
    }
    // Dense cases retain every slot. Reserve a new row within the scrollable
    // canvas when its existing free space has no full-size marker cell left.
    let nearest: Point | undefined;
    for (let y = edge; y <= fieldHeight - edge; y += pitch) {
      for (let x = edge; x <= width - edge; x += pitch) {
        const point = { x, y };
        if (available(point) && (!nearest ||
            Math.hypot(x - anchor.x, y - anchor.y) < Math.hypot(nearest.x - anchor.x, nearest.y - anchor.y))) nearest = point;
      }
    }
    if (nearest) return nearest;
    const point = { x: edge, y: fieldHeight + edge };
    fieldHeight += pitch;
    return point;
  }

  for (const { id, points } of targets) {
    const onPath = onWire(points);
    if (onPath) {
      markers.push({ id, point: onPath });
    } else {
      const anchor = wireTarget(points);
      markers.push({ id, point: nextPoint(anchor), anchor });
    }
  }
  return { height: fieldHeight, markers };
}
