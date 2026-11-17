import { expect, it } from "vitest";
import { solveACPowerFlow } from "./ac-power-flow";
import { appendPowerEquipment, removePowerEquipment } from "./author";
import { calculateOverlayReadings } from "./flow-overlay";
import { readPowerNetwork } from "./network";
import { exampleRingConfiguration } from "./ring-example";

it("derives branch loading with parallel ratings and voltage warnings from a single solved snapshot", () => {
  const result = solveACPowerFlow(exampleRingConfiguration);
  const first = result.branches[0];
  const line = exampleRingConfiguration.catalogue.types[0];
  expect(line.kind).toBe("line");
  if (line.kind !== "line") throw Error("fixture");
  const data = calculateOverlayReadings({ ...exampleRingConfiguration,
    catalogue: { schemaVersion: 1, types: [{ ...line, maxCurrentA: 100 }] },
    network: readPowerNetwork({ ...exampleRingConfiguration.network, elements: exampleRingConfiguration.network.elements.map(
      device => device.kind === "line" && device.id === first.id ? { ...device, parallelCircuits: 2 } : device) }),
  }, { ...result, nodes: result.nodes.map(bus => bus.busId === "B2" ? { ...bus, voltageKv: 100 } : bus),
    branches: result.branches.map(branch => branch.id === first.id ? { ...branch, fromCurrentKa: .3, toCurrentKa: .2 } : branch) });
  expect(data.branches.find(branch => branch.id === first.id)).toMatchObject({ loadingPercent: 150, overloaded: true });
  expect(data.nodes.find(bus => bus.busId === "B2")?.outOfRange).toBe(true);
  expect(calculateOverlayReadings(exampleRingConfiguration, result).branches.every(branch => branch.loadingPercent === null)).toBe(true);
});

it("assembles physical power objects and rejects deletion of connected buses", () => {
  let network = readPowerNetwork({ schemaVersion: 1, buses: [], elements: [] });
  network = appendPowerEquipment(network, { kind: "bus", nominalKv: 110 });
  network = appendPowerEquipment(network, { kind: "bus", nominalKv: 10 });
  network = appendPowerEquipment(network, { kind: "source", firstBusId: "B1" });
  network = appendPowerEquipment(network, { kind: "transformer", firstBusId: "B1", secondBusId: "B2" });
  network = appendPowerEquipment(network, { kind: "load", firstBusId: "B2" });
  expect(network.elements).toMatchObject([
    { kind: "source", voltageKv: 110 }, { kind: "transformer", highBusId: "B1", lowBusId: "B2" }, { kind: "load", busId: "B2" },
  ]);
  expect(() => removePowerEquipment(network, "B2")).toThrow("power-author-bus-in-use");
  network = removePowerEquipment(network, "D1");
  expect(network.elements.map(element => element.id)).toEqual(["S1", "T1"]);
});
