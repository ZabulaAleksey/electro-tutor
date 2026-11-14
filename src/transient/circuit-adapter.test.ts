import { expect, it } from "vitest";
import { emptyDrawing, lineDemoDrawing, placeComponent, placeLine, wireDrawing } from "../circuit/drawing";
import { disconnect, netlist } from "../circuit/topology";
import { resistiveLoadReadings, transmissionCircuitAdapter } from "./circuit-adapter";
import { at, historyValue, simulateNetwork } from "./network";

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

it("keeps programmed source timing, switch timing and distributed losses", () => {
  let drawing = lineDemoDrawing();
  drawing.topology = disconnect(drawing.topology, "W2");
  drawing = placeComponent(drawing, "line", { x: 260, y: 250 });
  drawing = placeComponent(drawing, "switch", { x: 110, y: 250 });
  drawing.topology = { ...drawing.topology, components: drawing.topology.components.map(part => {
    if (part.id === "V1") return { ...part, parameters: { voltageV: 12, resistanceOhm: 50, onS: 0.001, offS: 0.04 } };
    if (part.id === "S1") return { ...part, parameters: { closed: false, atS: 0.004, closes: true } };
    if (part.id === "TL1") return { ...part, parameters: { ...part.parameters, resistanceOhmM: 1e-6 } };
    return part;
  }) };
  drawing = wireDrawing(wireDrawing(wireDrawing(drawing, "TL1:b", "S1:a"), "S1:b", "TL2:a"), "TL2:b", "R1:a");
  const { model } = transmissionCircuitAdapter.convert(drawing.topology);
  expect(model.source).toMatchObject({ resistanceOhm: 50, onS: 0.001, offS: 0.04 });
  expect(model.durationS).toBe(0.04);
  expect(model.sections[0].resistanceOhmM).toBe(1e-6);
  expect(model.series?.[0].switch).toEqual({ closed: false, atS: 0.004, closes: true });
  const run = simulateNetwork(model);
  expect(at(run, 1_000_000, 0.003).u).toBeCloseTo(0);
  expect(at(run, 1_000_000, 0.015).u).toBeGreaterThan(0);
});

it("maps the series voltage division back to stable resistor identifiers", () => {
  const readings = resistiveLoadReadings({ id: "combined", kind: "series", children: [
    { id: "r1", kind: "r", value: 20 }, { id: "r2", kind: "r", value: 30 },
  ] }, 10);
  expect(readings.get("r1")).toEqual({ voltage: 4, current: 0.2 });
  expect(readings.get("r2")).toEqual({ voltage: 6, current: 0.2 });
});

it("maps an edited terminal resistance schedule to the correct solver and reading IDs", () => {
  const drawing = lineDemoDrawing();
  drawing.topology = { ...drawing.topology, components: drawing.topology.components.map(part =>
    part.id === "R1" ? { ...part, parameters: { ...part.parameters, changeAtS: 0.01, nextOhm: 100 } } : part) };
  const { model } = transmissionCircuitAdapter.convert(drawing.topology);
  expect(model.events).toEqual([expect.objectContaining({ target: "R1", atS: 0.01, value: 100 })]);
  expect(resistiveLoadReadings(model.load, 12, model.events, 0.005).get("R1")?.current).toBe(0.24);
  expect(resistiveLoadReadings(model.load, 12, model.events, 0.015).get("R1")?.current).toBe(0.12);
  expect(at(simulateNetwork(model), 500_000, 0.011).u).toBeGreaterThan(12);
});

it("maps bounded sampled states of a reactive compound load without changing the calculation", () => {
  let drawing = lineDemoDrawing();
  drawing = placeComponent(drawing, "c", { x: 420, y: 240 });
  drawing = wireDrawing(wireDrawing(drawing, "TL1:b", "C1:a"), "C1:b", "V1:b");
  const { model } = transmissionCircuitAdapter.convert(drawing.topology);
  const run = simulateNetwork(model, { reportDevices: true });
  expect(run.method).toBe("characteristics-trapezoid");
  const c = run.deviceTraces?.C1;
  const r = run.deviceTraces?.R1;
  expect(c?.voltage.values.length).toBeLessThanOrEqual(2002);
  expect(r?.voltage.times.at(-1)).toBeCloseTo(model.durationS);
  expect(historyValue(c!.voltage, 0.009, true)).toBeCloseTo(historyValue(r!.voltage, 0.009, true));
  expect(run.ports).toEqual(simulateNetwork(model).ports);
});
