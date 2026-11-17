import { expect, it } from "vitest";
import { testPowerCatalogue, testPowerLine } from "../../tests/fixtures/power-catalogue";
import { applyPowerOverride, mergePowerCatalogue, selectPowerType, type PowerConfiguration } from "./configuration";
import { examplePowerNetwork } from "./diagram";
import { configuredLineEquivalent, generateLineEquivalent } from "./line-equivalent";
import type { PowerLine } from "./network";

const line: PowerLine = {
  id: "line", kind: "line", fromBusId: "a", toBusId: "b", lengthKm: 50, parallelCircuits: 2, inService: true,
};

it("divides the series impedance and doubles both shunt terms for two identical circuits", () => {
  const type = { ...testPowerLine, rOhmPerKm: .2, xOhmPerKm: .4, gSiemensPerKm: 1e-6,
    shunt: { kind: "susceptance", siemensPerKm: 4e-6 } as const };
  const result = generateLineEquivalent(line, type, 110);
  expect(result.impedancePerCircuitOhm).toEqual({ re: 10, im: 20 });
  expect(result.seriesOhm).toEqual({ re: 5, im: 10 });
  expect(result.totalShuntSiemens.re).toBeCloseTo(1e-4, 15);
  expect(result.totalShuntSiemens.im).toBeCloseTo(4e-4, 15);
  expect(result.shuntPerEndSiemens.im).toBeCloseTo(2e-4, 15);
});

it("converts capacitance to susceptance at the specified type frequency", () => {
  const expected = 2 * Math.PI * 50 * 11e-9 * 50 * 2;
  const result = generateLineEquivalent(line, testPowerLine, 110);
  expect(result.frequencyHz).toBe(50);
  expect(result.shuntPerEndSiemens.re).toBe(0);
  expect(result.totalShuntSiemens.im).toBeCloseTo(expected, 16);
  expect(result.shuntPerEndSiemens.im).toBeCloseTo(expected / 2, 16);
});

it("honors the effective per-device override and inherits the equal nominal voltage of both buses", () => {
  const workspace: PowerConfiguration = { network: examplePowerNetwork, catalogue: { schemaVersion: 1, types: [] }, overrides: new Map() };
  const custom = { ...testPowerLine, ratedKv: undefined };
  let configuration = mergePowerCatalogue(workspace, { ...testPowerCatalogue, types: [custom] });
  configuration = selectPowerType(configuration, "L1", custom);
  expect(configuredLineEquivalent(configuration, "L1").nominalKv).toBe(110);
  expect(configuredLineEquivalent(configuration, "L1").seriesOhm.re).toBeCloseTo(4.6, 12);
  configuration = applyPowerOverride(configuration, "L1", { ...custom, rOhmPerKm: .55 });
  expect(configuredLineEquivalent(configuration, "L1").seriesOhm.re).toBeCloseTo(11, 12);
  const mismatched = { ...configuration, network: { ...configuration.network,
    buses: configuration.network.buses.map(bus => bus.id === "B2" ? { ...bus, nominalKv: 220 } : bus) } };
  expect(() => configuredLineEquivalent(mismatched, "L1")).toThrow("power-line-ambiguous-voltage");
});

it("rejects an invalid parallel count or a non-finite output", () => {
  expect(() => generateLineEquivalent({ ...line, parallelCircuits: 0 }, testPowerLine, 110)).toThrow("power-invalid-line-equivalent");
  expect(() => generateLineEquivalent({ ...line, lengthKm: 1e308 }, { ...testPowerLine, rOhmPerKm: 100 }, 110))
    .toThrow("power-line-equivalent-range");
});
