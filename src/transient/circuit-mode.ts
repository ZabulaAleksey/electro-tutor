import { circuitPartKinds, type CircuitLaboratoryMode } from "../circuit/editor-mode";
import { decodeLineCircuit, serializeLineCircuit } from "./line-archive-document";
import { DEFAULT_NETWORK, type Network } from "./network";

export const transientCircuitMode: CircuitLaboratoryMode<Network> = {
  createDefaultDocument: () => serializeLineCircuit(DEFAULT_NETWORK, {}, [], false),
  availableParts: drawing => !drawing.extension && drawing.topology.components.length ? circuitPartKinds : [],
  readModel: decodeLineCircuit,
};
