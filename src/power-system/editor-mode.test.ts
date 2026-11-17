import { expect, it } from "vitest";
import { parseCircuit } from "../circuit/document";
import { freeCircuitMode } from "../circuit/editor-mode";
import { reactiveLcMode } from "../circuit/reactive-lc-mode";
import { steadyCircuitMode } from "../steady-line/circuit-mode";
import { transientCircuitMode } from "../transient/circuit-mode";
import { powerSystemEditorMode } from "./editor-mode";

it("keeps four laboratory adapters and the free editor independent", () => {
  const adapters = [transientCircuitMode, steadyCircuitMode, reactiveLcMode, powerSystemEditorMode, freeCircuitMode];
  expect(new Set(adapters.map(mode => mode.id)).size).toBe(5);
  const doc = (mode: typeof freeCircuitMode) => parseCircuit(mode.createDefaultDocument()).drawing;
  const power = doc(powerSystemEditorMode);
  expect(power.topology.components.map(component => component.kind)).toContain("power-transformer");
  expect(powerSystemEditorMode.availableParts(power)).toEqual([]);
  expect(reactiveLcMode.availableParts(doc(reactiveLcMode))).toEqual(["l", "c"]);
  expect(steadyCircuitMode.availableParts(doc(steadyCircuitMode))).not.toContain("diode");
  expect(transientCircuitMode.readModel(transientCircuitMode.createDefaultDocument()).sections).toHaveLength(1);
  expect(transientCircuitMode.availableParts(doc(transientCircuitMode))).toEqual([]);
  expect(transientCircuitMode.availableParts(doc(steadyCircuitMode))).toContain("line");
  for (const adapter of adapters.filter(mode => mode !== powerSystemEditorMode)) {
    expect(adapter.availableParts(doc(adapter)).some(kind => kind.startsWith("power-"))).toBe(false);
  }
});

it("rejects cross-mode inputs that lack the electrical requirements", () => {
  expect(() => transientCircuitMode.readModel(reactiveLcMode.createDefaultDocument())).toThrow();
  expect(() => steadyCircuitMode.readModel(powerSystemEditorMode.createDefaultDocument())).toThrow();
  expect(() => reactiveLcMode.readModel(transientCircuitMode.createDefaultDocument())).toThrow();
});
