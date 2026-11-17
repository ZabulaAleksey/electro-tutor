import type { PowerConfiguration } from "./configuration";
import { createPowerDiagram } from "./diagram";
import { readPowerNetwork } from "./network";
import { exampleRingConfiguration } from "./ring-example";

const ring = exampleRingConfiguration.network;
const network = readPowerNetwork({
  ...ring,
  buses: [...ring.buses, { id: "B4", nominalKv: 110 }],
  elements: [
    ...ring.elements.map(element => element.id === "L3" ? { ...element, toBusId: "B4" } : element),
    { id: "Q1", kind: "switch", fromBusId: "B4", toBusId: "B1", closed: false },
  ],
});
export const normallyOpenConfiguration: PowerConfiguration = { ...exampleRingConfiguration, network };
export const normallyOpenDiagram = createPowerDiagram(network, {
  S1: { x: 78, y: 120, rotation: 180 }, L1: { x: 350, y: 120, rotation: 0 },
  L2: { x: 550, y: 200, rotation: 90 }, L3: { x: 350, y: 280, rotation: 180 },
  D1: { x: 680, y: 120, rotation: 0 }, D2: { x: 680, y: 280, rotation: 0 },
  Q1: { x: 160, y: 200, rotation: 270 },
}, { B1: { x: 160, y: 120 }, B2: { x: 550, y: 120 }, B3: { x: 550, y: 280 }, B4: { x: 160, y: 280 } });
