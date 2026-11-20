import { circuitPartKinds, type CircuitLaboratoryMode } from "../circuit/editor-mode";
import { decodeLineCircuit, serializeLineCircuit } from "./line-archive-document";
import { STARTER_NETWORK, type Network } from "./network";
import { transientCircuitGlyph } from "./TransientCircuitGlyph";

export const transientCircuitMode: CircuitLaboratoryMode<Network> = {
  id: "transient-line",
  lockComponentPositions: true,
  renderGlyph: transientCircuitGlyph,
  createDefaultDocument: () => serializeLineCircuit(STARTER_NETWORK, {
    ["@span-" + STARTER_NETWORK.sections[0].id]: 78,
  }, [], false),
  availableParts: drawing => !drawing.extension && drawing.topology.components.length ? circuitPartKinds : [],
  readModel: decodeLineCircuit,
};
