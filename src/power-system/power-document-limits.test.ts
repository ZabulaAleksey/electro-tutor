import { expect, it } from "vitest";
import { solveACPowerFlow } from "./ac-power-flow";
import { appendPowerEquipment } from "./author";
import { layoutPowerNetwork } from "./layout";
import { readPowerNetwork } from "./network";

it("keeps a network larger than the AC solver limit editable and connected", () => {
  const network = readPowerNetwork({ schemaVersion: 1,
    buses: Array.from({ length: 64 }, (_, index) => ({ id: `B${index + 1}`, nominalKv: 110 })),
    elements: Array.from({ length: 193 }, (_, index) => ({
      kind: "load", id: `D${index + 1}`, busId: `B${index % 64 + 1}`, inService: true, activeMw: 0, reactiveMvar: 0,
    })),
  });
  const expanded = appendPowerEquipment(network, { kind: "bus", nominalKv: 110 });
  const diagram = layoutPowerNetwork(expanded);
  expect(diagram.simplified).toBe(true);
  expect(diagram.drawing.topology.junctions).toContain("B65");
  expect(diagram.drawing.topology.components).toHaveLength(193);
  expect(diagram.drawing.topology.wires).toHaveLength(193);
  expect(Object.keys(diagram.routing.paths)).toHaveLength(193);
  expect(diagram.drawing.topology.wires.at(-1)).toMatchObject({ from: "D193:a", to: "B1" });
  expect(() => solveACPowerFlow({ network: expanded, catalogue: { schemaVersion: 1, types: [] }, overrides: new Map() }))
    .toThrow("power-ac-network-limit");
});

it("bounds the physical document separately before building its diagram", () => {
  const buses = Array.from({ length: 128 }, (_, index) => ({ id: `B${index + 1}`, nominalKv: 110 }));
  const maximum = readPowerNetwork({ schemaVersion: 1, buses, elements: [] });
  expect(maximum.buses).toHaveLength(128);
  expect(() => appendPowerEquipment(maximum, { kind: "bus", nominalKv: 110 })).toThrow("power-document-limit");
  expect(() => readPowerNetwork({ schemaVersion: 1, buses, elements: Array.from({ length: 257 }) }))
    .toThrow("power-document-limit");
});
