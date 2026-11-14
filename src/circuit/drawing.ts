import { addComponent, addJunction, connect, disconnect, emptyCircuit, type CircuitComponent, type CircuitTopology } from "./topology";

export type Point = { x: number; y: number };
export type Placement = Point & { rotation: number; span?: number; pinned?: boolean };
export type Drawing = { topology: CircuitTopology; positions: Record<string, Placement>; junctionPositions: Record<string, Point> };
export const parts = {
  r: { prefix: "R", parameters: { ohm: 100 } },
  l: { prefix: "L", parameters: { henry: 0.01 } },
  c: { prefix: "C", parameters: { farad: 0.0001 } },
  voltage: { prefix: "V", parameters: { voltageV: 12 } },
  line: { prefix: "TL", parameters: { lengthM: 500_000, impedanceOhm: 50, velocityMS: 200_000_000 } },
  diode: { prefix: "D", parameters: {} },
};
export type PartKind = keyof typeof parts;

export const emptyDrawing = (): Drawing => ({ topology: emptyCircuit(), positions: {}, junctionPositions: {} });

export function placeComponent(drawing: Drawing, kind: PartKind, point: Point): Drawing {
  const { prefix, parameters } = parts[kind];
  const ids = new Set(drawing.topology.components.map(item => item.id));
  let number = 1;
  while (ids.has(prefix + number)) number++;
  const id = prefix + number;
  const component: CircuitComponent = { id, kind, terminals: [id + ":a", id + ":b"], parameters };
  return {
    ...drawing,
    topology: addComponent(drawing.topology, component),
    positions: { ...drawing.positions, [id]: { ...point, rotation: 0 } },
  };
}

export function canPlace(drawing: Drawing, point: Point, except?: string, clearance = 76): boolean {
  return Object.values(drawing.junctionPositions).every(junction =>
    Math.abs(junction.x - point.x) >= 40 || Math.abs(junction.y - point.y) >= 40) && Object.entries(drawing.positions).every(([id, other]) =>
    id === except || Math.abs(other.x - point.x) >= clearance || Math.abs(other.y - point.y) >= clearance);
}

export function demoDrawing() {
  const placements: [PartKind, number, number][] = [
    ["voltage", 90, 150], ["r", 210, 90], ["l", 330, 90], ["c", 450, 150],
  ];
  let drawing = placements.reduce((draft, [kind, x, y]) => placeComponent(draft, kind, { x, y }), emptyDrawing());
  for (const [from, to] of [["V1:b", "R1:a"], ["R1:b", "L1:a"], ["L1:b", "C1:a"], ["C1:b", "V1:a"]]) {
    drawing = wireDrawing(drawing, from, to);
  }
  return drawing;
}

function unusedId(ids: string[], prefix: string) {
  const taken = new Set(ids);
  let number = 1;
  while (taken.has(prefix + number)) number++;
  return prefix + number;
}

export function wireDrawing(drawing: Drawing, from: string, to: string): Drawing {
  const id = unusedId(drawing.topology.wires.map(wire => wire.id), "W");
  return { ...drawing, topology: connect(drawing.topology, id, from, to) };
}

export function junctionAt(drawing: Drawing, point: Point): Drawing {
  const id = unusedId([...drawing.topology.junctions], "J");
  return {
    ...drawing, topology: addJunction(drawing.topology, id),
    junctionPositions: { ...drawing.junctionPositions, [id]: point },
  };
}


export function insertInWire(drawing: Drawing, wireId: string, kind: PartKind, point: Point, rotation: number): Drawing {
  const wire = drawing.topology.wires.find(item => item.id === wireId);
  if (!wire) throw Error("unknown-wire");
  const placed = placeComponent(drawing, kind, point);
  const component = placed.topology.components.at(-1)!;
  const [first, second] = component.terminals;
  const draft = { ...placed, topology: disconnect(placed.topology, wireId), positions: {
    ...placed.positions, [component.id]: { ...point, rotation },
  } };
  return wireDrawing(wireDrawing(draft, wire.from, first), second, wire.to);
}


export function lineDemoDrawing(): Drawing {
  let drawing = placeComponent(emptyDrawing(), "voltage", { x: 100, y: 140 });
  drawing = placeComponent(drawing, "line", { x: 270, y: 140 });
  drawing = placeComponent(drawing, "r", { x: 440, y: 140 });
  drawing = { ...drawing, topology: {
    ...drawing.topology, components: drawing.topology.components.map(item =>
      item.kind === "r" ? { ...item, parameters: { ohm: 50 } } : item),
  } };
  for (const [from, to] of [["V1:a", "TL1:a"], ["TL1:b", "R1:a"], ["R1:b", "V1:b"]]) {
    drawing = wireDrawing(drawing, from, to);
  }
  return drawing;
}


export function placeLine(drawing: Drawing, first: Point, second: Point): Drawing {
  const vertical = Math.abs(second.y - first.y) > Math.abs(second.x - first.x);
  const delta = vertical ? second.y - first.y : second.x - first.x;
  const span = Math.abs(delta);
  if (span < 60) throw Error("line-span");
  const center = vertical ? { x: first.x, y: first.y + delta / 2 } : { x: first.x + delta / 2, y: first.y };
  const rotation = vertical ? (delta > 0 ? 90 : 270) : (delta > 0 ? 0 : 180);
  const next = placeComponent(drawing, "line", center);
  const id = next.topology.components.at(-1)!.id;
  return { ...next, positions: { ...next.positions, [id]: { ...center, rotation, span } } };
}
