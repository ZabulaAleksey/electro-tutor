import { expect, it } from "vitest";
import { testPowerCatalogue, testPowerLine } from "../../tests/fixtures/power-catalogue";
import { parseCircuit } from "../circuit/document";
import { netlist } from "../circuit/topology";
import { applyPowerOverride, changePowerNetwork, clearPowerOverride, mergePowerCatalogue, resolveEffectivePowerType, selectPowerType, type PowerConfiguration } from "./configuration";
import { examplePowerDiagram, examplePowerNetwork } from "./diagram";

const empty: PowerConfiguration = { network: examplePowerNetwork, catalogue: { schemaVersion: 1, types: [] }, overrides: new Map() };

it("projects the teaching network on the common editor with its terminals and physical switch", () => {
  const { drawing, routing } = parseCircuit(examplePowerDiagram);
  expect(routing.unrouted).toEqual([]);
  const nets = netlist(drawing.topology);
  for (const [bus, endpoint] of [["B1", "S1:a"], ["B1", "Q1:a"], ["B2", "L1:b"], ["B3", "T1:a"], ["B4", "D1:a"]]) {
    expect(nets.some(net => net.includes(bus) && net.includes(endpoint))).toBe(true);
  }
  expect(drawing.topology.components.find(item => item.id === "Q1")?.parameters.closed).toBe(false);
});

it("isolates local overrides from other devices and the pinned catalogue revision", () => {
  let configuration = mergePowerCatalogue(empty, testPowerCatalogue);
  configuration = selectPowerType(selectPowerType(configuration, "L1", testPowerLine), "L2", testPowerLine);
  configuration = applyPowerOverride(configuration, "L1", { ...testPowerLine, rOhmPerKm: .5 });
  expect(resolveEffectivePowerType(configuration, "L1")).toMatchObject({ revision: 1, rOhmPerKm: .5 });
  expect(resolveEffectivePowerType(configuration, "L2")).toEqual(testPowerLine);
  expect(configuration.catalogue).toEqual(testPowerCatalogue);
  expect(() => applyPowerOverride(configuration, "L1", { ...testPowerLine, rOhmPerKm: -1 })).toThrow();
  expect(resolveEffectivePowerType(clearPowerOverride(configuration, "L1"), "L1")).toEqual(testPowerLine);
});

it("allows repeated imports of identical versions and rejects conflicting catalogue revisions", () => {
  const configuration = mergePowerCatalogue(empty, testPowerCatalogue);
  expect(mergePowerCatalogue(configuration, testPowerCatalogue).catalogue).toEqual(testPowerCatalogue);
  expect(() => mergePowerCatalogue(configuration, { schemaVersion: 1, types: [{ ...testPowerLine, rOhmPerKm: 1 }] }))
    .toThrow("power-conflicting-catalogue-revision");
});

it("discards a local override when a device loses its catalogue revision", () => {
  const pinned = selectPowerType(mergePowerCatalogue(empty, testPowerCatalogue), "L1", testPowerLine);
  const changed = applyPowerOverride(pinned, "L1", { ...testPowerLine, rOhmPerKm: .5 });
  const physical = { ...changed.network, elements: changed.network.elements.map(item =>
    item.id === "L1" ? { ...item, typeId: undefined, typeRevision: undefined } : item) };
  expect(resolveEffectivePowerType({ ...changed, network: physical }, "L1")).toBeUndefined();
  const decoded = changePowerNetwork(changed, physical);
  expect(decoded.overrides.size).toBe(0);
  expect(resolveEffectivePowerType(decoded, "L1")).toBeUndefined();
});
