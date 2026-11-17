import { expect, it } from "vitest";
import type { RlcEquivalent } from "../circuit/rlc-reduction";
import { defaultCircuitSettings, serializeCircuit } from "../circuit/document";
import { lineDemoDrawing, placeComponent, wireDrawing } from "../circuit/drawing";
import { disconnect } from "../circuit/topology";
import { transmissionCircuitAdapter } from "./circuit-adapter";
import { analyzeLineCircuit, readLineArchive } from "./line-archive-document";
import { liftLineReadings } from "./line-readings";

it("uses the calculation and component directions when dividing series voltage", () => {
  const equivalents = new Map<string, RlcEquivalent>([
    ["reduced", { kind: "r", connection: "series", value: 50, members: [
      { id: "R1", value: 20, polarity: 1 }, { id: "R2", value: 30, polarity: -1 },
    ] }],
  ]);
  const output = liftLineReadings(new Map([["reduced", { voltage: 50, current: 1 }]]),
    equivalents, new Map([["reduced", -1]]));
  expect(output).toEqual(new Map([["R1", { voltage: -20, current: -1 }], ["R2", { voltage: 30, current: 1 }]]));
});

it("uses the original direction for a standalone component without an equivalent", () => {
  const values = new Map([["C1", { voltage: -4, current: .5 }]]);
  expect(liftLineReadings(values, new Map(), new Map([["C1", -1]]))).toEqual(
    new Map([["C1", { voltage: 4, current: -.5 }]]),
  );
});

it("lifts nested reactive series and parallel measurements to physical capacitors", () => {
  const equivalents = new Map<string, RlcEquivalent>([
    ["series", { kind: "c", connection: "series", value: 1.5, members: [
      { id: "parallel", value: 3, polarity: 1 }, { id: "C3", value: 3, polarity: 1 },
    ] }],
    ["parallel", { kind: "c", connection: "parallel", value: 3, members: [
      { id: "C1", value: 1, polarity: 1 }, { id: "C2", value: 2, polarity: -1 },
    ] }],
  ]);
  const output = liftLineReadings(new Map([["series", { voltage: 12, current: 3 }]]), equivalents, new Map());
  expect(output).toEqual(new Map([
    ["C1", { voltage: 6, current: 1 }], ["C2", { voltage: -6, current: -2 }], ["C3", { voltage: 6, current: 3 }],
  ]));
});

it("does not assign individual currents to indistinguishable parallel shorts", () => {
  const equivalents = new Map<string, RlcEquivalent>([
    ["shorts", { kind: "r", connection: "parallel", value: 0, members: [
      { id: "R0a", value: 0, polarity: 1 }, { id: "R0b", value: 0, polarity: 1 },
    ] }],
  ]);
  const output = liftLineReadings(new Map([["shorts", { voltage: 0, current: 1 }]]), equivalents, new Map());
  expect(output).toEqual(new Map([["R0a", { voltage: 0 }], ["R0b", { voltage: 0 }]]));
});

function seriesLoad() {
  const initial = lineDemoDrawing();
  const drawing = placeComponent({ ...initial, topology: disconnect(initial.topology, "W3") }, "r", { x: 440, y: 260 });
  return wireDrawing(wireDrawing(drawing, "R1:b", "R2:a"), "R2:b", "V1:b");
}

it("preserves an accepted v2 graph with its unreduced legacy observations", () => {
  const wired = seriesLoad();
  const circuit = serializeCircuit(wired, defaultCircuitSettings);
  const model = transmissionCircuitAdapter.convert(wired.topology).model;
  expect(analyzeLineCircuit(circuit).model.load).toMatchObject({ kind: "r", value: 150 });
  const archive = readLineArchive(JSON.stringify({ schema: "electrotutor-line-v2", circuit, model }));
  expect(archive.circuit).toBe(circuit);
  expect(analyzeLineCircuit(archive.circuit, archive.model).model).toEqual(model);
  expect(analyzeLineCircuit(archive.circuit, archive.model).equivalents.size).toBe(0);
});

it("uses the supported original load when the equivalent exceeds a solver element limit", () => {
  const drawing = seriesLoad();
  const large = { ...drawing, topology: { ...drawing.topology, components: drawing.topology.components.map(part => part.kind === "r"
    ? { ...part, parameters: { ...part.parameters, ohm: 75e6 } } : part) } };
  const result = analyzeLineCircuit(serializeCircuit(large, defaultCircuitSettings));
  expect(result.equivalents.size).toBe(0);
  expect(result.model.load.children?.map(part => part.value)).toEqual([75e6, 75e6]);
});
