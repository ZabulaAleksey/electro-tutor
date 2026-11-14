import { expect, it } from "vitest";
import { emptyDrawing, lineDemoDrawing, placeLine } from "../circuit/drawing";
import { netlist } from "../circuit/topology";
import { transmissionCircuitAdapter } from "./circuit-adapter";
import { at, simulateNetwork } from "./network";

it("converts the editor graph into a solvable matched line with stable section and load IDs", () => {
  const drawing = lineDemoDrawing();
  expect(netlist(drawing.topology)).toContainEqual(["R1:a", "TL1:b"]);
  const { model, resultIds } = transmissionCircuitAdapter.convert(drawing.topology);
  expect(model.sections).toEqual([{ id: "TL1", lengthM: 500_000, impedanceOhm: 50, velocityMS: 200_000_000 }]);
  expect(model.load).toEqual({ id: "R1", kind: "r", value: 50 });
  expect(resultIds.get("TL1")).toBe("TL1");
  expect(resultIds.get("R1")).toBe("R1");
  expect(at(simulateNetwork(model), 500_000, 0.01).u).toBeCloseTo(12);
});

it("rejects an electrically incomplete source, line and load graph", () => {
  const drawing = lineDemoDrawing();
  const topology = { ...drawing.topology, wires: drawing.topology.wires.slice(0, 2) };
  expect(() => transmissionCircuitAdapter.convert(topology)).toThrow("unsupported-line-load");
});

it("keeps the physical line length independent of the on-screen span", () => {
  const short = placeLine(emptyDrawing(), { x: 120, y: 120 }, { x: 180, y: 120 });
  const long = placeLine(emptyDrawing(), { x: 120, y: 120 }, { x: 360, y: 120 });
  expect(short.positions.TL1.span).toBe(60);
  expect(long.positions.TL1.span).toBe(240);
  expect(long.topology).toEqual(short.topology);
  expect(long.topology.components[0].parameters.lengthM).toBe(500_000);
});
