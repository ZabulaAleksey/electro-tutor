import { addComponent, addJunction, connect, emptyCircuit, type CircuitComponent, type CircuitTopology } from "./topology";

export type Point = { x: number; y: number };
export type Placement = Point & { rotation: number };
export type Drawing = { topology: CircuitTopology; positions: Record<string, Placement>; junctionPositions: Record<string, Point> };
export const parts = {
  r: { prefix: "R", parameters: { ohm: 100 } },
  l: { prefix: "L", parameters: { henry: 0.01 } },
  c: { prefix: "C", parameters: { farad: 0.0001 } },
  voltage: { prefix: "V", parameters: { voltageV: 12 } },
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

export function canPlace(drawing: Drawing, point: Point, except?: string): boolean {
  return Object.values(drawing.junctionPositions).every(junction =>
    Math.abs(junction.x - point.x) >= 40 || Math.abs(junction.y - point.y) >= 40) && Object.entries(drawing.positions).every(([id, other]) =>
    id === except || Math.abs(other.x - point.x) >= 76 || Math.abs(other.y - point.y) >= 76);
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
