import { expect, it } from "vitest";
import { solveACPowerFlow } from "./ac-power-flow";
import { changePowerNetwork } from "./configuration";
import { setPowerSwitch } from "./network";
import { normallyOpenConfiguration } from "./normally-open";
import { solveRadialFlow } from "./radial-flow";
import { createPowerStudy } from "./topology";

it("physically closes the normally open ring and recalculates real branch currents", () => {
  const opened = normallyOpenConfiguration;
  expect(createPowerStudy(opened.network).islands[0].topology).toBe("radial");
  const radial = solveRadialFlow(opened);
  const openedAc = solveACPowerFlow(opened);
  expect(openedAc.branches.find(branch => branch.id === "Q1")).toBeUndefined();
  expect(radial.nodes.find(node => node.busId === "B4")!.voltageKv)
    .toBeCloseTo(openedAc.nodes.find(node => node.busId === "B4")!.voltageKv, 7);
  const closed = changePowerNetwork(opened, setPowerSwitch(opened.network, "Q1", true));
  expect(createPowerStudy(closed.network, [{ busId: "B2", quantity: "p" }]).islands[0].topology).toBe("meshed");
  expect(() => solveRadialFlow(closed)).toThrow("power-flow-mesh");
  const result = solveACPowerFlow(closed);
  expect(result.nodes.find(bus => bus.busId === "B4")!.voltageKv).toBeCloseTo(110, 10);
  expect(result.branches.find(branch => branch.id === "Q1")?.fromCurrentKa).toBeGreaterThan(0);
  expect(result.powerBalanceErrorMva).toBeLessThan(1e-7);
  expect(opened.network.elements.find(part => part.id === "Q1")).toMatchObject({ closed: false });
});
