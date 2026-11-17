import { expect, it } from "vitest";
import { solveACPowerFlow } from "./ac-power-flow";
import { assessRingAgreement, compareRingSolvers } from "./ring-agreement";
import { exampleRingConfiguration } from "./ring-example";
import { refineRingWithLosses } from "./ring-refinement";

it("agrees with independent nodal AC for both ring initializations and both cut points", () => {
  const defaultCut = compareRingSolvers(exampleRingConfiguration, "lengths");
  const alternateCut = compareRingSolvers(exampleRingConfiguration, "impedances", [{ busId: "B3", quantity: "q" }]);
  expect(defaultCut.pass).toBe(true);
  expect(alternateCut.pass).toBe(true);
  expect(defaultCut.maximum.voltageKv).toBeLessThan(1e-6);
  expect(defaultCut.maximum.activeMw).toBeLessThan(1e-6);
  expect(alternateCut.maximum.reactiveMvar).toBeLessThan(1e-6);
});

it("accepts equivalent physical reversal and catches reactive sign and voltage-unit errors", () => {
  const ring = refineRingWithLosses(exampleRingConfiguration, "lengths", []);
  const ac = solveACPowerFlow(exampleRingConfiguration);
  const [branch, ...others] = ac.branches;
  const reverse = { ...branch, fromBusId: branch.toBusId, toBusId: branch.fromBusId,
    sendingPowerMva: { re: -branch.receivingPowerMva!.re, im: -branch.receivingPowerMva!.im },
    receivingPowerMva: { re: -branch.sendingPowerMva!.re, im: -branch.sendingPowerMva!.im } };
  expect(assessRingAgreement(ring, { ...ac, branches: [reverse, ...others] }).pass).toBe(true);
  const changed = { ...reverse, sendingPowerMva: { ...reverse.sendingPowerMva, im: -reverse.sendingPowerMva.im } };
  const result = assessRingAgreement(ring, { ...ac, branches: [changed, ...others],
    nodes: ac.nodes.map(bus => bus.busId === "B3" ? { ...bus, voltageKv: bus.voltageKv * 1000 } : bus) });
  expect(result.pass).toBe(false);
  expect(result.mismatchedIds).toEqual(expect.arrayContaining(["B3", branch.id]));
});
