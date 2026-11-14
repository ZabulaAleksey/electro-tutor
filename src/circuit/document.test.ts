import { expect, it } from "vitest";
import { defaultCircuitSettings, maxCircuitFileBytes, parseCircuit, serializeCircuit } from "./document";
import { demoDrawing, insertInWire } from "./drawing";
import { netlist } from "./topology";

it("round-trips an edited RLC circuit, metadata and presentation settings", () => {
  const drawing = insertInWire(demoDrawing(), "W2", "diode", { x: 270, y: 90 }, 0);
  const settings = { ...defaultCircuitSettings, zigzag: true };
  const text = serializeCircuit(drawing, settings, "RLC");
  const reopened = parseCircuit(text);
  expect(reopened.drawing).toEqual(drawing);
  expect(reopened.settings).toEqual(settings);
  expect(reopened.title).toBe("RLC");
  expect(reopened.routing.unrouted).toEqual([]);
  expect(netlist(reopened.drawing.topology)).toEqual(netlist(drawing.topology));
});

it("rejects oversized, unknown-version, and mismatched geometry documents", () => {
  expect(() => parseCircuit(" ".repeat(maxCircuitFileBytes + 1))).toThrow("file-limit");
  expect(() => parseCircuit('{"schemaVersion":2}')).toThrow("unsupported-version");
  const original = serializeCircuit(demoDrawing(), defaultCircuitSettings);
  const object = JSON.parse(original);
  delete object.geometry.positions.V1;
  expect(() => parseCircuit(JSON.stringify(object))).toThrow("invalid-document");
  expect(() => parseCircuit(original.replace('"ohm": 100', '"ohm": -100'))).toThrow("invalid-parameter");
});
