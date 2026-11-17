import { expect, it } from "vitest";
import { defaultCircuitSettings, parseCircuit, serializeCircuit } from "../circuit/document";
import { demoDrawing, emptyDrawing, lineDemoDrawing } from "../circuit/drawing";
import { circuitPartKinds, freeCircuitMode } from "../circuit/editor-mode";
import { transientCircuitMode } from "./circuit-mode";
import { STARTER_NETWORK } from "./network";

it("gives the free editor an empty document and the generic palette", () => {
  const { drawing } = parseCircuit(freeCircuitMode.createDefaultDocument());
  expect(drawing).toEqual(emptyDrawing());
  expect(freeCircuitMode.availableParts(drawing)).toEqual(circuitPartKinds);
});

it("opens the transient starter template and validates a free-form line graph", () => {
  const initial = transientCircuitMode.createDefaultDocument();
  expect(transientCircuitMode.readModel(initial)).toEqual(STARTER_NETWORK);
  expect(transientCircuitMode.availableParts(parseCircuit(initial).drawing)).toEqual([]);
  const line = lineDemoDrawing();
  expect(transientCircuitMode.availableParts(line)).toEqual(circuitPartKinds);
  expect(transientCircuitMode.readModel(serializeCircuit(line, defaultCircuitSettings)).sections[0].id).toBe("TL1");
  expect(() => transientCircuitMode.readModel(serializeCircuit(demoDrawing(), defaultCircuitSettings))).toThrow("unsupported-line-circuit");
});
