import { circuitPartKinds, type CircuitLaboratoryMode } from "../circuit/editor-mode";
import { decodeLineCircuit, serializeLineCircuit } from "./line-archive-document";
import { STARTER_NETWORK, type Network } from "./network";

export const transientCircuitMode: CircuitLaboratoryMode<Network> = {
  id: "transient-line",
  createDefaultDocument: () => serializeLineCircuit(STARTER_NETWORK, {}, [], false),
  availableParts: drawing => !drawing.extension && drawing.topology.components.length ? circuitPartKinds : [],
  readModel: decodeLineCircuit,
};
