import { expect, it } from "vitest";
import type { EquipmentCatalogue, LineType, TransformerType } from "./catalogue";
import type { PowerConfiguration } from "./configuration";
import { readPowerNetwork, type PowerElement } from "./network";
import { solveRadialFlow } from "./radial-flow";

const lineType: LineType = { id: "line", revision: 1, kind: "line", name: "Example R", provenance: { kind: "custom" },
  ratedFrequencyHz: 50, ratedKv: 10, rOhmPerKm: 1, xOhmPerKm: 0, shunt: { kind: "susceptance", siemensPerKm: 0 } };
const transformerType: TransformerType = { id: "transformer", revision: 1, kind: "transformer", name: "Example transformer",
  provenance: { kind: "custom" }, ratedMva: 8, highKv: 40, lowKv: 10, shortCircuitPct: 4,
  resistance: { kind: "resistance-percent", percent: 0 }, noLoadLossKw: 0, noLoadCurrentPct: 0, phaseShiftDeg: 15 };
const source = { id: "S", kind: "source", busId: "A", voltageKv: 10, angleDeg: 0, inService: true } as const;
const line = (id: string, fromBusId: string, toBusId: string): PowerElement => ({ id, kind: "line", fromBusId, toBusId,
  lengthKm: 1, parallelCircuits: 1, inService: true, typeId: "line", typeRevision: 1 });
const load = (id: string, busId: string, activeMw = 1): PowerElement =>
  ({ id, kind: "load", busId, activeMw, reactiveMvar: 0, inService: true });
const transformer = { id: "T", kind: "transformer", highBusId: "A", lowBusId: "B", parallelUnits: 1,
  inService: true, typeId: "transformer", typeRevision: 1 } as const;

function configuration(busIds: string[], elements: PowerElement[], types: EquipmentCatalogue["types"] = [lineType]): PowerConfiguration {
  return { network: readPowerNetwork({ schemaVersion: 1, buses: busIds.map(id => ({ id, nominalKv: 10 })), elements }),
    catalogue: { schemaVersion: 1, types }, overrides: new Map() };
}

it("matches the high-voltage solution of the two-bus real power quadratic", () => {
  const result = solveRadialFlow(configuration(["A", "B"], [source, line("L", "A", "B"), load("D", "B")]));
  const expectedKv = (10 + Math.sqrt(96)) / 2;
  expect(result.nodes[1].voltageKv).toBeCloseTo(expectedKv, 7);
  expect(result.branches[0].receivingPowerMva.re).toBeCloseTo(1, 7);
  expect(result.branches[0].seriesLossesMva.re).toBeCloseTo((1 / expectedKv) ** 2, 8);
  expect(result.sourceMva.re).toBeCloseTo(10 / expectedKv, 8);
  expect(result.powerBalanceErrorMva).toBeLessThan(1e-7);
});

it("propagates a load through two serial lines and aggregates a separate feeder branch", () => {
  const result = solveRadialFlow(configuration(["A", "B", "C", "D"], [
    source, line("L1", "A", "B"), line("L2", "B", "C"), line("L3", "D", "B"), load("LoadC", "C"), load("LoadD", "D"),
  ]));
  const receiveKv = result.nodes.find(node => node.busId === "C")!.voltageKv;
  expect(receiveKv).toBeCloseTo(result.nodes.find(node => node.busId === "D")!.voltageKv, 9);
  expect(receiveKv).toBeCloseTo((10 + Math.sqrt(88)) / 2, 7);
  expect(result.branches.find(branch => branch.id === "L3")!.receivingPowerMva.re).toBeLessThan(-1);
  expect(result.totalLoadMva.re).toBe(2);
  expect(result.totalAbsorptionMva.re).toBeCloseTo(6 / receiveKv ** 2, 8);
});

it("applies a complex tap from either physical side and reports unpowered buses", () => {
  const forward = solveRadialFlow(configuration(["A", "B", "C"], [
    { ...source, voltageKv: 40, angleDeg: 5 }, transformer,
  ], [transformerType]));
  expect(forward.nodes[1]).toMatchObject({ busId: "B" });
  expect(forward.nodes[1].voltageKv).toBeCloseTo(10, 10);
  expect(forward.nodes[1].angleDeg).toBeCloseTo(20, 10);
  expect(forward.unpoweredBusIds).toEqual(["C"]);
  const reverse = solveRadialFlow(configuration(["A", "B"], [
    { ...source, busId: "B", angleDeg: 30 }, transformer, load("VH", "A"),
  ], [transformerType]));
  expect(reverse.nodes[1].voltageKv).toBeLessThan(40);
  expect(reverse.branches[0].sendingPowerMva.re).toBeCloseTo(-1, 7);
  expect(reverse.powerBalanceErrorMva).toBeLessThan(1e-7);
});

it("accounts for capacitive shunts in reactive balance without counting them as series loss", () => {
  const result = solveRadialFlow(configuration(["A", "B"], [source, line("L", "A", "B")], [
    { ...lineType, shunt: { kind: "susceptance", siemensPerKm: .001 } },
  ]));
  expect(result.sourceMva.im).toBeCloseTo(-.1, 7);
  expect(result.branches[0].seriesLossesMva.im).toBe(0);
  expect(result.branches[0].totalAbsorptionMva.im).toBeLessThan(0);
});

it("rejects a physical mesh, missing type and nonconvergence before publishing values", () => {
  const elements = [source, line("L", "A", "B"), load("D", "B")];
  const mesh = configuration(["A", "B"], [...elements, { id: "Q", kind: "switch", fromBusId: "A", toBusId: "B", closed: true }]);
  expect(() => solveRadialFlow(mesh)).toThrow("power-flow-mesh");
  expect(() => solveRadialFlow(configuration(["A", "B"], elements, []))).toThrow("power-flow-branch-parameters:L");
  expect(() => solveRadialFlow(configuration(["A", "B"], elements), { maxIterations: 1 })).toThrow("power-flow-nonconvergence");
});
