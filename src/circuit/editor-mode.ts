import { defaultCircuitSettings, serializeCircuit } from "./document";
import { emptyDrawing, parts, type Drawing, type PartKind } from "./drawing";

export type CircuitEditorMode = {
  id: "free" | "transient-line" | "steady-line" | "reactive-lc" | "power-system";
  createDefaultDocument: () => string;
  example?: Readonly<Record<"ru" | "uk", string>>;
  availableParts: (drawing: Drawing) => readonly PartKind[];
};

export type CircuitLaboratoryMode<Model> = CircuitEditorMode & {
  readModel: (document: string) => Model;
};

export const circuitPartKinds = (Object.keys(parts) as PartKind[]).filter(kind => kind !== "port" && !kind.startsWith("power-"));

export const freeCircuitMode: CircuitEditorMode = {
  id: "free",
  createDefaultDocument: () => serializeCircuit(emptyDrawing(), defaultCircuitSettings),
  availableParts: () => circuitPartKinds,
};
