import { expect, it } from "vitest";
import { emptyDrawing, lineDemoDrawing, placeComponent, placeLine, wireDrawing } from "../circuit/drawing";
import { disconnect, netlist } from "../circuit/topology";
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

it("keeps legacy-compatible compound loads and intermediate branches in the converted model", () => {
  let drawing = lineDemoDrawing();
  drawing = placeComponent(drawing, "c", { x: 420, y: 240 });
  drawing = placeComponent(drawing, "diode", { x: 270, y: 240 });
  drawing = wireDrawing(wireDrawing(drawing, "TL1:b", "C1:a"), "C1:b", "V1:b");
  drawing = wireDrawing(wireDrawing(drawing, "TL1:a", "D1:a"), "D1:b", "TL1:b");
  const { model, resultIds } = transmissionCircuitAdapter.convert(drawing.topology);
  expect(model.load.kind).toBe("parallel");
  expect(model.load.children?.map(child => [child.id, child.kind])).toEqual([["C1", "c"], ["R1", "r"]]);
  expect(model.branches?.map(branch => [branch.id, branch.from, branch.to, branch.component?.kind])).toEqual([["D1", 0, 1, "diode"]]);
  expect(resultIds.get("D1")).toBe("D1");
});

it("preserves an internal terminal when converting a series load", () => {
  let drawing = lineDemoDrawing();
  drawing.topology = disconnect(drawing.topology, "W3");
  drawing = placeComponent(drawing, "l", { x: 430, y: 250 });
  drawing = wireDrawing(wireDrawing(drawing, "R1:b", "L1:a"), "L1:b", "V1:b");
  const { model } = transmissionCircuitAdapter.convert(drawing.topology);
  expect(model.load.kind).toBe("series");
  expect(model.load.children?.map(child => child.id)).toEqual(["L1", "R1"]);
});

it("converts a switch between physical sections and a standalone Norton source", () => {
  let drawing = lineDemoDrawing();
  drawing.topology = disconnect(drawing.topology, "W2");
  drawing = placeComponent(drawing, "line", { x: 260, y: 250 });
  drawing = placeComponent(drawing, "switch", { x: 110, y: 250 });
  drawing.topology = {
    ...drawing.topology,
    components: drawing.topology.components.map(part => part.id !== "V1" ? part :
      { ...part, kind: "current", parameters: { currentA: 0.24 } }),
  };
  drawing = wireDrawing(wireDrawing(wireDrawing(drawing, "TL1:b", "S1:a"), "S1:b", "TL2:a"), "TL2:b", "R1:a");
  const { model } = transmissionCircuitAdapter.convert(drawing.topology);
  expect(model.source.currentA).toBe(0.24);
  expect(model.sections.map(section => section.id)).toEqual(["TL1", "TL2"]);
  expect(model.series).toEqual([{ id: "S1", from: 1, to: 3, switch: { closed: true } }]);
  expect(at(simulateNetwork(model), 1_000_000, 0.01).u).toBeCloseTo(12);
});
