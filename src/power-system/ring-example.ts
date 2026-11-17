import type { PowerConfiguration } from "./configuration";
import { createPowerDiagram } from "./diagram";
import { readPowerNetwork } from "./network";

const typeLink = { typeId: "ring-training-line", typeRevision: 1 } as const;
const equipment = { inService: true } as const;
const network = readPowerNetwork({
  schemaVersion: 1,
  buses: ["B1", "B2", "B3"].map(id => ({ id, nominalKv: 110 })),
  elements: [
    { id: "S1", kind: "source", busId: "B1", voltageKv: 110, angleDeg: 0, ...equipment },
    { id: "L1", kind: "line", fromBusId: "B1", toBusId: "B2", lengthKm: 10, parallelCircuits: 1, ...equipment, ...typeLink },
    { id: "L2", kind: "line", fromBusId: "B2", toBusId: "B3", lengthKm: 10, parallelCircuits: 1, ...equipment, ...typeLink },
    { id: "L3", kind: "line", fromBusId: "B3", toBusId: "B1", lengthKm: 20, parallelCircuits: 1, ...equipment, ...typeLink },
    { id: "D1", kind: "load", busId: "B2", activeMw: 6, reactiveMvar: 0, ...equipment },
    { id: "D2", kind: "load", busId: "B3", activeMw: 2, reactiveMvar: 4, ...equipment },
  ],
});

export const exampleRingConfiguration: PowerConfiguration = {
  network, overrides: new Map(),
  catalogue: { schemaVersion: 1, types: [{
    id: typeLink.typeId, revision: typeLink.typeRevision, kind: "line", name: "R′ = 0.12 Ω/km · X′ = 0.21 Ω/km",
    provenance: { kind: "custom" }, ratedFrequencyHz: 50, ratedKv: 110, rOhmPerKm: .12, xOhmPerKm: .21,
    shunt: { kind: "capacitance", faradPerKm: 8e-9 },
  }] },
};

export const exampleRingDiagram = createPowerDiagram(network, {
  S1: { x: 78, y: 120, rotation: 180 },
  L1: { x: 350, y: 120, rotation: 0 }, L2: { x: 550, y: 200, rotation: 90 }, L3: { x: 350, y: 280, rotation: 180 },
  D1: { x: 680, y: 120, rotation: 0 }, D2: { x: 680, y: 280, rotation: 0 },
}, { B1: { x: 160, y: 120 }, B2: { x: 550, y: 120 }, B3: { x: 550, y: 280 } });
