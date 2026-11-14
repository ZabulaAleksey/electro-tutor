import { addComponent, emptyCircuit, type CircuitComponent, type CircuitTopology } from "./topology";

export type Point = { x: number; y: number };
export type Placement = Point & { rotation: number };
export type Drawing = { topology: CircuitTopology; positions: Record<string, Placement> };
export const parts = {
  r: { prefix: "R", parameters: { ohm: 100 } },
  l: { prefix: "L", parameters: { henry: 0.01 } },
  c: { prefix: "C", parameters: { farad: 0.0001 } },
  voltage: { prefix: "V", parameters: { voltageV: 12 } },
  diode: { prefix: "D", parameters: {} },
};
export type PartKind = keyof typeof parts;

export const emptyDrawing = (): Drawing => ({ topology: emptyCircuit(), positions: {} });

export function placeComponent(drawing: Drawing, kind: PartKind, point: Point): Drawing {
  const { prefix, parameters } = parts[kind];
  const ids = new Set(drawing.topology.components.map(item => item.id));
  let number = 1;
  while (ids.has(prefix + number)) number++;
  const id = prefix + number;
  const component: CircuitComponent = { id, kind, terminals: [id + ":a", id + ":b"], parameters };
  return {
    topology: addComponent(drawing.topology, component),
    positions: { ...drawing.positions, [id]: { ...point, rotation: 0 } },
  };
}

export function canPlace(drawing: Drawing, point: Point, except?: string): boolean {
  return Object.entries(drawing.positions).every(([id, other]) =>
    id === except || Math.abs(other.x - point.x) >= 76 || Math.abs(other.y - point.y) >= 76);
}

export function demoDrawing() {
  const placements: [PartKind, number, number][] = [
    ["voltage", 90, 150], ["r", 210, 90], ["l", 330, 90], ["c", 450, 150],
  ];
  return placements.reduce((drawing, [kind, x, y]) => placeComponent(drawing, kind, { x, y }), emptyDrawing());
}
