import { expect, it } from "vitest";
import { solveACPowerFlow } from "./ac-power-flow";
import type { EquipmentCatalogue } from "./catalogue";
import type { PowerConfiguration } from "./configuration";
import { readPowerNetwork, type PowerBranch, type PowerElement } from "./network";

const catalogue: EquipmentCatalogue = { schemaVersion: 1, types: [{
  id: "R", revision: 1, kind: "line", name: "Resistive test line", provenance: { kind: "custom" }, ratedKv: 110,
  ratedFrequencyHz: 50, rOhmPerKm: 1, xOhmPerKm: 0, shunt: { kind: "susceptance", siemensPerKm: 0 },
}, {
  id: "T", revision: 1, kind: "transformer", name: "Test transformer", provenance: { kind: "custom" }, ratedMva: 100,
  highKv: 110, lowKv: 10, shortCircuitPct: 10, resistance: { kind: "resistance-percent", percent: .5 },
  noLoadLossKw: 0, noLoadCurrentPct: 0, phaseShiftDeg: -20,
}] };
const source = { id: "S", kind: "source", busId: "A", voltageKv: 110, angleDeg: 0, inService: true } as const;
function line(id: string, fromBusId: string, toBusId: string, lengthKm: number): PowerBranch {
  return { id, kind: "line", fromBusId, toBusId, lengthKm, typeId: "R", typeRevision: 1, inService: true, parallelCircuits: 1 };
}
function load(id: string, busId: string, activeMw: number, reactiveMvar = 0): PowerElement {
  return { id, kind: "load", busId, activeMw, reactiveMvar, inService: true };
}
function configuration(busIds: string[], elements: PowerElement[]): PowerConfiguration {
  return { network: readPowerNetwork({ schemaVersion: 1, buses: busIds.map(id => ({ id, nominalKv: id === "LV" ? 10 : 110 })), elements }),
    catalogue, overrides: new Map() };
}

it("matches an independently prescribed 110/108/107 kV meshed AC case", () => {
  const result = solveACPowerFlow(configuration(["A", "B", "C"], [
    source, line("AB", "A", "B", 1), line("BC", "B", "C", 2), line("CA", "C", "A", 4),
    load("DB", "B", 162), load("DC", "C", 133.75),
  ]));
  const volts = new Map(result.nodes.map(node => [node.busId, node.voltageKv]));
  expect(volts.get("B")).toBeCloseTo(108, 8);
  expect(volts.get("C")).toBeCloseTo(107, 8);
  expect(result.sources[0].powerMva.re).toBeCloseTo(302.5, 7);
  expect(result.branches.find(item => item.id === "CA")!.sendingPowerMva!.re).toBeCloseTo(-80.25, 7);
  expect(result.powerBalanceErrorMva).toBeLessThan(1e-6);
});

it("collapses a closed ideal switch and recovers its current by physical KCL", () => {
  const result = solveACPowerFlow(configuration(["A", "B", "C", "D"], [
    source, line("AB", "A", "B", 1), { id: "Q", kind: "switch", fromBusId: "B", toBusId: "C", closed: true },
    load("DC", "C", 108),
  ]));
  expect(result.nodes.find(node => node.busId === "B")!.voltageKv).toBeCloseTo(result.nodes.find(node => node.busId === "C")!.voltageKv, 12);
  const contact = result.branches.find(item => item.id === "Q")!;
  expect(contact.sendingPowerMva!.re).toBeCloseTo(108, 7);
  expect(contact.fromCurrentKa!).toBeGreaterThan(0);
  expect(contact.seriesLossesMva.re).toBe(0);
  expect(result.unpoweredBusIds).toEqual(["D"]);
});

it("reports indeterminate loop currents and recovers a unique ideal spur current", () => {
  const result = solveACPowerFlow(configuration(["A", "B", "C", "D"], [
    source, { id: "Q1", kind: "switch", fromBusId: "A", toBusId: "B", closed: true },
    { id: "Q2", kind: "switch", fromBusId: "B", toBusId: "C", closed: true },
    { id: "Q3", kind: "switch", fromBusId: "C", toBusId: "A", closed: true },
    { id: "Q4", kind: "switch", fromBusId: "C", toBusId: "D", closed: true }, load("DB", "B", 3), load("DD", "D", 2),
  ]));
  expect(result.branches.slice(0, 3).map(branch => branch.fromCurrentKa)).toEqual([null, null, null]);
  expect(result.branches[3].sendingPowerMva!.re).toBeCloseTo(2, 10);
  expect(result.sources[0].powerMva.re).toBeCloseTo(5, 10);
});

it("stamps a complex transformer ratio and responds to constant signed reactive load", () => {
  const elements: PowerElement[] = [source,
    { id: "TX", kind: "transformer", highBusId: "A", lowBusId: "LV", typeId: "T", parallelUnits: 1, inService: true }];
  const open = solveACPowerFlow(configuration(["A", "LV"], elements));
  const node = open.nodes.find(item => item.busId === "LV")!;
  expect(node.voltageKv).toBeCloseTo(10, 10);
  expect(node.angleDeg).toBeCloseTo(-20, 10);
  const loaded = solveACPowerFlow(configuration(["A", "LV"], [...elements, load("D", "LV", 10, 3)]));
  expect(loaded.nodes.find(item => item.busId === "LV")!.voltageKv).toBeLessThan(10);
  expect(loaded.sources[0].powerMva.re).toBeGreaterThan(10);
  expect(loaded.sources[0].powerMva.im).toBeGreaterThan(3);
  expect(loaded.maxMismatchMva).toBeLessThan(1e-7);
});

it("diagnoses a missing reference and bounded nonconvergence", () => {
  expect(() => solveACPowerFlow(configuration(["A", "B"], [line("AB", "A", "B", 1)]))).toThrow("power-ac-source-required");
  expect(() => solveACPowerFlow(configuration(["A", "B"], [source, line("AB", "A", "B", 1), load("D", "B", 5000)]),
    { maxIterations: 2 })).toThrow(/power-ac-(nonconvergence|jacobian-singular)/);
});
