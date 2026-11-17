import { defaultCircuitSettings, serializeCircuit } from "./document";
import { emptyDrawing, parts, type Drawing, type PartKind } from "./drawing";

export type CircuitEditorMode = {
  createDefaultDocument: () => string;
  availableParts: (drawing: Drawing) => readonly PartKind[];
};

export type CircuitLaboratoryMode<Model> = CircuitEditorMode & {
  readModel: (document: string) => Model;
};

export const circuitPartKinds = Object.keys(parts) as PartKind[];

export const freeCircuitMode: CircuitEditorMode = {
  createDefaultDocument: () => serializeCircuit(emptyDrawing(), defaultCircuitSettings),
  availableParts: () => circuitPartKinds,
};
