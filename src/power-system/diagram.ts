import { defaultCircuitSettings, serializeCircuit } from "../circuit/document";
import { wireDrawing, type Drawing, type PartKind, type Placement, type Point } from "../circuit/drawing";
import type { CircuitComponent } from "../circuit/topology";
import { powerBranchEndpoints, readPowerNetwork, type PowerNetwork } from "./network";

export const examplePowerNetwork: PowerNetwork = readPowerNetwork({
  schemaVersion: 1,
  buses: [
    { id: "B1", nominalKv: 110 }, { id: "B2", nominalKv: 110 },
    { id: "B3", nominalKv: 110 }, { id: "B4", nominalKv: 10 },
  ],
  elements: [
    { id: "S1", kind: "source", busId: "B1", voltageKv: 110, angleDeg: 0, inService: true },
    { id: "L1", kind: "line", fromBusId: "B1", toBusId: "B2", lengthKm: 20, parallelCircuits: 1, inService: true },
    { id: "L2", kind: "line", fromBusId: "B2", toBusId: "B3", lengthKm: 15, parallelCircuits: 1, inService: true },
    { id: "T1", kind: "transformer", highBusId: "B3", lowBusId: "B4", parallelUnits: 1, inService: true },
    { id: "Q1", kind: "switch", fromBusId: "B1", toBusId: "B3", closed: false },
    { id: "D1", kind: "load", busId: "B4", activeMw: 8, reactiveMvar: 2, inService: true },
  ],
});

const symbols: Record<PowerNetwork["elements"][number]["kind"], PartKind> = {
  source: "power-source", load: "power-load", line: "power-line", transformer: "power-transformer", switch: "switch",
};

export function createPowerDiagram(
  network: PowerNetwork, positions: Record<string, Placement>, busPositions: Record<string, Point>,
): string {
  let drawing: Drawing = {
    board: { width: 780, height: 360 },
    positions,
    junctionPositions: busPositions,
    topology: {
      components: network.elements.map<CircuitComponent>(element => {
        const parameters: Record<string, boolean> = {};
        if (element.kind === "switch") parameters.closed = element.closed;
        return { id: element.id, kind: symbols[element.kind], terminals: [element.id + ":a", element.id + ":b"], parameters };
      }),
      junctions: network.buses.map(bus => bus.id),
      wires: [],
    },
  };
  for (const element of network.elements) {
    if (element.kind === "source" || element.kind === "load") {
      drawing = wireDrawing(drawing, element.id + ":a", element.busId);
    } else {
      const [from, to] = powerBranchEndpoints(element);
      drawing = wireDrawing(wireDrawing(drawing, element.id + ":a", from), element.id + ":b", to);
    }
  }
  return serializeCircuit(drawing, defaultCircuitSettings);
}

export const examplePowerDiagram = createPowerDiagram(examplePowerNetwork, {
  S1: { x: 78, y: 142, rotation: 180 }, L1: { x: 232, y: 142, rotation: 0 },
  L2: { x: 416, y: 142, rotation: 0 }, T1: { x: 602, y: 142, rotation: 0 },
  Q1: { x: 330, y: 270, rotation: 0 }, D1: { x: 700, y: 262, rotation: 90 },
}, {
  B1: { x: 155, y: 142 }, B2: { x: 320, y: 142 }, B3: { x: 510, y: 142 }, B4: { x: 700, y: 142 },
});
