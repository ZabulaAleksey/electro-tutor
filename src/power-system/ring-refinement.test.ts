import { expect, it } from "vitest";
import { exampleRingConfiguration } from "./ring-example";
import { refineRingWithLosses } from "./ring-refinement";
import { createPowerStudy } from "./topology";

it("closes the two supply paths and balances independent branch losses", () => {
  const result = refineRingWithLosses(exampleRingConfiguration, "impedances", []);
  expect(result.cutBusId).toBe("B2");
  expect(result.nodes.find(bus => bus.busId === "B1")!.voltageKv).toBeCloseTo(110, 12);
  expect(result.sourceMva.re).toBeCloseTo(8 + result.totalAbsorptionMva.re, 7);
  expect(result.totalAbsorptionMva.re).toBeGreaterThan(0);
  expect(result.voltageResidualPu).toBeLessThan(1e-9);
  for (const branch of result.branches) {
    expect(branch.sendingMva.re - branch.receivingMva.re).toBeCloseTo(branch.seriesLossMva.re, 7);
    expect(branch.sendingMva.im - branch.receivingMva.im).toBeCloseTo(branch.totalAbsorptionMva.im, 7);
  }
});

it("repartitions a changed calculation cut and leaves the physical solution and mesh intact", () => {
  const cuts = [{ quantity: "p", busId: "B3" }, { quantity: "q", busId: "B2" }] as const;
  const original = refineRingWithLosses(exampleRingConfiguration, "lengths", []);
  const shifted = refineRingWithLosses(exampleRingConfiguration, "impedances", cuts);
  expect(shifted.cutBusId).toBe("B3");
  expect(shifted.leftDeliveryMva.re + shifted.rightDeliveryMva.re).toBeCloseTo(2, 8);
  expect(shifted.nodes.find(bus => bus.busId === "B3")!.voltageKv)
    .toBeCloseTo(original.nodes.find(bus => bus.busId === "B3")!.voltageKv, 8);
  expect(shifted.sourceMva.re).toBeCloseTo(original.sourceMva.re, 9);
  expect(createPowerStudy(exampleRingConfiguration.network, cuts).islands[0].topology).toBe("meshed");
});

it("reports bounded nonconvergence without publishing intermediate voltages", () => {
  expect(() => refineRingWithLosses(exampleRingConfiguration, "impedances", [], { maxIterations: 1 }))
    .toThrow("power-ring-refinement-convergence");
});
