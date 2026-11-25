import { netlist, type CircuitComponent, type CircuitWire } from "./topology";
import type { TopologyLabDocument } from "./topology-session";

export type Point = Readonly<{ x: number; y: number }>;
type Placed = Point & Readonly<{ id: string }>;
type PlacedWire = Readonly<{ id: string; points: readonly Point[] }>;

export type TopologyLayout = Readonly<{
  width: number;
  height: number;
  components: readonly Placed[];
  junctions: readonly Placed[];
  wires: readonly PlacedWire[];
  endpoints: ReadonlyMap<string, Point>;
  anchors: ReadonlyMap<string, Readonly<{ left: Point; right: Point }>>;
}>;

type Cell = Readonly<{ id: string; x: number; row: number }>;
type Port = Readonly<{ cell: Cell; offset: number; yOffset?: number }>;
type Trace = { id: string; net: number; from: Port; to: Port; direct: boolean; exitX: number; entranceX: number };
type Span = { net: number; min: number; max: number };

const maxColumns = 8;
const columnPitch = 184;
const anchorOffset = 80;
const terminalOffset = 52;
const portalOffset = 76;
const returnRailOffset = 44;
const returnPortalOffset = 88;
const firstX = 105;
const firstY = 115;
const rowPitch = 232;
const trackPitch = 7;
const trackStart = 50;

function compareId(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }

function orderBase(
  components: readonly CircuitComponent[],
  nets: readonly (readonly string[])[],
  netByEndpoint: ReadonlyMap<string, number>,
  junctions: readonly string[],
  hinted: ReadonlySet<string>,
) {
  const junctionIds = new Set(junctions);
  const visited = new Set<string>();
  const order: string[] = [];
  const incidence: { part: CircuitComponent; index: number }[][] = nets.map(() => []);
  function place(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    order.push(id);
  }

  for (const part of components) {
    if (hinted.has(part.id)) continue;
    for (const [index, endpoint] of part.terminals.entries()) {
      incidence[netByEndpoint.get(endpoint)!].push({ part, index });
    }
  }

  const sourcePriority = (part: CircuitComponent) =>
    Number(part.kind !== "voltage" && part.kind !== "current");
  const seeds = components.filter(part => !hinted.has(part.id)).sort((a, b) =>
    sourcePriority(a) - sourcePriority(b) || compareId(a.id, b.id));
  for (const seed of seeds) {
    if (visited.has(seed.id)) continue;
    let part = seed;
    let outgoing = 1;
    while (!visited.has(part.id)) {
      place(part.id);
      const index = netByEndpoint.get(part.terminals[outgoing])!;
      for (const id of nets[index]) {
        if (junctionIds.has(id)) place(id);
      }
      const following = incidence[index]
        .filter(({ part }) => !visited.has(part.id))
        .sort((a, b) => Number(b.part.kind === "line") - Number(a.part.kind === "line")
          || a.index - b.index || compareId(a.part.id, b.part.id))[0];
      if (!following) break;
      part = following.part;
      outgoing = following.index % 2 === 0 ? following.index + 1 : following.index - 1;
    }
  }
  for (const id of [...junctions].sort(compareId)) place(id);
  return order;
}

function cellGroups(document: TopologyLabDocument, nets: readonly (readonly string[])[],
  netByEndpoint: ReadonlyMap<string, number>) {
  const hints = new Map(document.attachmentSides.map(({ componentId, side }) => [componentId, side]));
  const { components, junctions } = document.topology;
  const base = orderBase(components, nets, netByEndpoint, junctions, new Set(hints.keys()));
  const left = components.filter(({ id }) => hints.get(id) === "left").map(({ id }) => id).sort(compareId);
  const right = components.filter(({ id }) => hints.get(id) === "right").map(({ id }) => id).sort(compareId);
  const columns = Math.min(maxColumns, Math.max(1, base.length, left.length, right.length));
  const cells = new Map<string, Cell>();
  const occupants: Cell[][] = [];
  function put(id: string, row: number, column: number) {
    const cell = { id, x: firstX + column * columnPitch, row };
    cells.set(id, cell);
    (occupants[row] ??= []).push(cell);
  }
  const baseRow = Math.ceil(left.length / columns);
  for (const [index, id] of base.entries()) put(id, baseRow + Math.floor(index / columns), index % columns);

  const columnsByNet = nets.map(() => new Set<number>());
  const partById = new Map(components.map(part => [part.id, part]));
  for (const id of base) {
    const column = (cells.get(id)!.x - firstX) / columnPitch;
    for (const endpoint of partById.get(id)?.terminals ?? [id]) {
      columnsByNet[netByEndpoint.get(endpoint)!].add(column);
    }
  }
  function putHints(group: readonly string[], firstRow: number) {
    for (const [index, id] of group.entries()) {
      const row = firstRow + Math.floor(index / columns);
      const connected = partById.get(id)!.terminals.flatMap(endpoint => [...columnsByNet[netByEndpoint.get(endpoint)!]]);
      const preferred = connected.length ? connected.reduce((sum, column) => sum + column, 0) / connected.length : 0;
      const used = new Set(occupants[row]?.map(cell => (cell.x - firstX) / columnPitch));
      const available = Array.from({ length: columns }, (_, column) => column).filter(column => !used.has(column));
      available.sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred) || a - b);
      put(id, row, available[0]);
    }
  }
  putHints(left, 0);
  putHints(right, baseRow + Math.ceil(base.length / columns));
  return { cells, occupants, columns };
}

function portal(port: Port, destination: Port) {
  const side = Math.sign(port.offset) || Math.sign(destination.cell.x - port.cell.x) || 1;
  return port.cell.x + side * (port.yOffset ? returnPortalOffset : portalOffset);
}

function sketchWire(wire: CircuitWire, ports: ReadonlyMap<string, Port>, netByEndpoint: ReadonlyMap<string, number>,
  occupants: readonly (readonly Cell[])[]): Trace {
  const from = ports.get(wire.from)!;
  const to = ports.get(wire.to)!;
  const direction = Math.sign(to.cell.x - from.cell.x);
  const direct = from.cell.row === to.cell.row && (from.yOffset ?? 0) === (to.yOffset ?? 0) && direction !== 0
    && (from.offset === 0 || Math.sign(from.offset) === direction)
    && (to.offset === 0 || Math.sign(to.offset) === -direction)
    && occupants[from.cell.row].every(({ x }) => x <= Math.min(from.cell.x, to.cell.x) || x >= Math.max(from.cell.x, to.cell.x));
  return { id: wire.id, net: netByEndpoint.get(wire.from)!, from, to, direct, exitX: portal(from, to), entranceX: portal(to, from) };
}

function includeSpan(row: Map<number, Span>, net: number, x1: number, x2: number) {
  const current = row.get(net);
  row.set(net, {
    net,
    min: Math.min(x1, x2, current?.min ?? Infinity),
    max: Math.max(x1, x2, current?.max ?? -Infinity),
  });
}

function bundleTracks(rows: readonly ReadonlyMap<number, Span>[], firstTrack: number) {
  let rowY = firstY;
  return rows.map((spans) => {
    const trackByNet = new Map<number, number>();
    const rightEdges: number[] = [];
    // Electrically unrelated intervals can share one track only when they do not touch.
    for (const { net, min, max } of [...spans.values()].sort((a, b) => a.min - b.min || a.net - b.net)) {
      const free = rightEdges.findIndex(edge => edge + trackPitch <= min);
      const track = free >= 0 ? free : rightEdges.length;
      rightEdges[track] = max;
      trackByNet.set(net, rowY + firstTrack + track * trackPitch);
    }
    const center = rowY;
    const lastTrack = rowY + firstTrack + Math.max(0, rightEdges.length - 1) * trackPitch;
    rowY = Math.max(center + rowPitch, lastTrack + anchorOffset + 45);
    return { center, lastTrack, trackByNet };
  });
}

function tidy(points: readonly Point[]) {
  const result: Point[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous?.x === point.x && previous.y === point.y) continue;
    const preceding = result.at(-2);
    if (preceding && previous &&
      ((preceding.x === previous.x && previous.x === point.x) ||
        (preceding.y === previous.y && previous.y === point.y))) {
      result.pop();
    }
    result.push(point);
  }
  return result;
}

/** Compute geometric projection only. Existing terminal and wire IDs remain the electrical source of truth. */
export function layoutTopology(document: TopologyLabDocument, boundaryPortId?: string): TopologyLayout {
  const { topology } = document;
  if (topology.components.some(part => part.terminals.length !== 2 && (part.kind !== "line" || part.terminals.length !== 4))) {
    throw Error("invalid-layout-part");
  }
  const hasSeparateReturn = topology.components.some(part => part.terminals.length === 4);
  const nets = netlist(topology);
  const netByEndpoint = new Map(nets.flatMap((net, index) => net.map(endpoint => [endpoint, index] as const)));
  const { cells, occupants, columns } = cellGroups(document, nets, netByEndpoint);
  const ports = new Map<string, Port>();
  for (const { id, terminals } of topology.components) {
    const cell = cells.get(id)!;
    if (id === boundaryPortId) {
      // Represent external leads as individual points at the edges of the circuit.
      occupants[cell.row] = occupants[cell.row].filter(item => item !== cell);
      for (const [index, terminal] of terminals.entries()) {
        const x = index === 0 ? 26 : firstX + columns * columnPitch;
        const boundary = { id: terminal, row: cell.row, x };
        occupants[cell.row].push(boundary);
        ports.set(terminal, { cell: boundary, offset: 0 });
      }
      continue;
    }
    ports.set(terminals[0], { cell, offset: -terminalOffset });
    ports.set(terminals[1], { cell, offset: terminalOffset });
    if (terminals.length === 4) {
      ports.set(terminals[2], { cell, offset: -terminalOffset, yOffset: returnRailOffset });
      ports.set(terminals[3], { cell, offset: terminalOffset, yOffset: returnRailOffset });
    }
  }
  for (const id of topology.junctions) ports.set(id, { cell: cells.get(id)!, offset: 0 });

  const traces = [...topology.wires].sort((a, b) => compareId(a.id, b.id))
    .map(wire => sketchWire(wire, ports, netByEndpoint, occupants));
  const externalNets = [...new Set(traces.filter(({ from, to }) => from.cell.row !== to.cell.row)
    .map(({ net }) => net))].sort((a, b) => a - b);
  const gridRight = firstX + (boundaryPortId ? columns : columns - 1) * columnPitch
    + (hasSeparateReturn ? returnPortalOffset : portalOffset);
  const trunkByNet = new Map(externalNets.map((net, index) => [net, gridRight + 30 + index * trackPitch]));
  const bands = occupants.map(() => new Map<number, Span>());
  for (const { direct, net, from, to, exitX, entranceX } of traces) {
    if (direct) continue;
    if (from.cell.row === to.cell.row) {
      includeSpan(bands[from.cell.row], net, exitX, entranceX);
      continue;
    }
    const trunk = trunkByNet.get(net)!;
    includeSpan(bands[from.cell.row], net, exitX, trunk);
    includeSpan(bands[to.cell.row], net, entranceX, trunk);
  }
  // Leave room for the four-pin glyph's return labels before routing tracks.
  const rows = bundleTracks(bands, hasSeparateReturn ? returnRailOffset + 30 : trackStart);
  const placed = ({ id, x, row }: Cell) => ({ id, x, y: rows[row].center });
  const components = [...topology.components].sort((a, b) => compareId(a.id, b.id)).map(({ id }) => placed(cells.get(id)!));
  const junctions = [...topology.junctions].sort(compareId).map(id => placed(cells.get(id)!));
  const anchors = new Map([...components, ...junctions].map(({ id, x, y }) =>
    [id, { left: { x, y: y - anchorOffset }, right: { x, y: y + anchorOffset } }]));

  function point(port: Port): Point {
    return { x: port.cell.x + port.offset, y: rows[port.cell.row].center + (port.yOffset ?? 0) };
  }
  const endpoints = new Map([...ports].map(([id, port]) => [id, point(port)]));
  const wires = traces.map(({ id, from, to, net, direct, exitX, entranceX }) => {
    const a = point(from);
    const b = point(to);
    if (direct) return { id, points: [a, b] };
    const exitY = rows[from.cell.row].trackByNet.get(net)!;
    const entranceY = rows[to.cell.row].trackByNet.get(net)!;
    const path: Point[] = [a, { x: exitX, y: a.y }, { x: exitX, y: exitY }];
    if (from.cell.row !== to.cell.row) {
      const trunk = trunkByNet.get(net)!;
      path.push({ x: trunk, y: exitY }, { x: trunk, y: entranceY });
    }
    path.push({ x: entranceX, y: entranceY }, { x: entranceX, y: b.y }, b);
    return { id, points: tidy(path) };
  });
  const last = rows.at(-1);
  return {
    width: Math.max(240, gridRight + 28, gridRight + 30 + externalNets.length * trackPitch + 25),
    height: last ? Math.max(last.center + anchorOffset + 43, last.lastTrack + 35) : rowPitch,
    components, junctions, wires, endpoints, anchors,
  };
}
