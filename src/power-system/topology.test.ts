import { expect, it } from "vitest";
import { readPowerNetwork, setPowerSwitch, type PowerNetwork } from "./network";
import { createPowerStudy } from "./topology";

const ring: PowerNetwork = {
  schemaVersion: 1,
  buses: [
    { id: "G", nominalKv: 110, name: "Питание" }, { id: "A", nominalKv: 110 },
    { id: "B", nominalKv: 110 }, { id: "T", nominalKv: 10 },
  ],
  elements: [
    { id: "S", kind: "source", busId: "G", voltageKv: 110, angleDeg: 0, inService: true },
    { id: "L1", kind: "line", fromBusId: "G", toBusId: "A", lengthKm: 26, parallelCircuits: 1, inService: true },
    { id: "L2", kind: "line", fromBusId: "A", toBusId: "B", lengthKm: 34, parallelCircuits: 2, inService: true },
    { id: "B1", kind: "switch", fromBusId: "B", toBusId: "G", closed: true },
    { id: "T1", kind: "transformer", highBusId: "B", lowBusId: "T", parallelUnits: 2, tapPosition: -1, inService: true },
    { id: "Load1", kind: "load", busId: "T", activeMw: 9, reactiveMvar: -3, inService: true },
  ],
};

it("loads the versioned physical study and closes an energized ring with a transformer", () => {
  const study = createPowerStudy(JSON.parse(JSON.stringify(ring)));
  expect(study.physical).toEqual(ring);
  expect(study.islands).toEqual([{
    busIds: ["G", "A", "B", "T"], branchIds: ["L1", "L2", "B1", "T1"],
    sourceIds: ["S"], loadIds: ["Load1"], energized: true, topology: "meshed",
  }]);
});

it("opens a physical switch without losing equipment and changes the ring to a radial feeder", () => {
  const changed = setPowerSwitch(ring, "B1", false);
  const study = createPowerStudy(changed);
  expect(study.physical.elements).toHaveLength(ring.elements.length);
  expect(study.physical.elements.find(device => device.id === "B1")).toMatchObject({ closed: false });
  expect(ring.elements.find(device => device.id === "B1")).toMatchObject({ closed: true });
  expect(study.islands[0]).toMatchObject({ branchIds: ["L1", "L2", "T1"], energized: true, topology: "radial" });
  expect(setPowerSwitch(changed, "B1", true)).toEqual(ring);
});

it("keeps the deenergized load visible as an island when the transformer is out of service", () => {
  const isolated = { ...ring, elements: ring.elements.map(device => device.kind === "transformer"
    ? { ...device, inService: false } : device) };
  const study = createPowerStudy(isolated);
  expect(study.physical.elements).toHaveLength(6);
  expect(study.islands).toContainEqual({
    busIds: ["T"], branchIds: [], sourceIds: [], loadIds: ["Load1"], energized: false, topology: "isolated",
  });
});

it("records independent P and Q cuts without changing physical or operating topology", () => {
  const intact = createPowerStudy(ring);
  const cuts = [{ busId: "A", quantity: "p" }, { busId: "B", quantity: "q" }] as const;
  const result = createPowerStudy(ring, cuts);
  expect(result.calculationCuts).toEqual(cuts);
  expect(result.physical).toEqual(intact.physical);
  expect(result.islands).toEqual(intact.islands);
  expect(() => createPowerStudy(ring, [{ busId: "missing", quantity: "p" }])).toThrow("power-invalid-calculation-cut");
});

it("rejects invalid bus references, duplicate IDs and malformed equipment atomically", () => {
  expect(() => readPowerNetwork({ ...ring, schemaVersion: 2 })).toThrow("power-invalid-document");
  expect(() => readPowerNetwork({ ...ring, buses: [...ring.buses, ring.buses[0]] })).toThrow("power-duplicate-id:G");
  const mutateLine = (changes: Record<string, unknown>) => ({
    ...ring, elements: ring.elements.map(device => device.id === "L1" ? { ...device, ...changes } : device),
  });
  for (const changes of [{ toBusId: "missing" }, { toBusId: "G" }, { parallelCircuits: 1.5 }, { lengthKm: -1 }]) {
    expect(() => readPowerNetwork(mutateLine(changes))).toThrow("power-invalid-element:L1");
  }
  expect(() => setPowerSwitch(ring, "L1", false)).toThrow("power-unknown-switch:L1");
  expect(createPowerStudy(ring).islands[0].topology).toBe("meshed");
});
