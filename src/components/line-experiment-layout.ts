import { layoutTopology, type Point, type TopologyLayout } from "../circuit/topology-layout";
import type { TopologyLabDocument } from "../circuit/topology-session";
import { netlist, type CircuitComponent } from "../circuit/topology";

type Rotation = 0 | 90 | -90 | 180;
type LineLayout = TopologyLayout & {
  rotations: ReadonlyMap<string, Rotation>;
  returnY?: number;
  append: Point;
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
  return { width: loadX + 69, height: 294, returnY: lower, append: { x: loadX, y: 42 },
    components: placements, junctions: [], wires, endpoints, anchors, rotations };
}

export function layoutLineExperiment(document: TopologyLabDocument): LineLayout {
  const loop = loopLayout(document);
  if (loop) return loop;
  const layout = layoutTopology(document);
  return { ...layout, width: Math.max(layout.width, 330), rotations: new Map(),
    append: { x: Math.max(layout.width, 330) - 40, y: 34 } };
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
