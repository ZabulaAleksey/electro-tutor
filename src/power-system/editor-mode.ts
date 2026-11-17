import type { CircuitEditorMode } from "../circuit/editor-mode";
import { examplePowerDiagram } from "./diagram";

export const powerSystemEditorMode: CircuitEditorMode = {
  id: "power-system",
  createDefaultDocument: () => examplePowerDiagram,
  // Power objects and buses are authored through the typed physical document.
  availableParts: () => [],
};
