import { expect, it } from "vitest";
import { changePowerNetwork } from "./configuration";
import { exampleRingConfiguration } from "./ring-example";
import { solvePreliminaryRing } from "./ring-preliminary";
import { createPowerStudy } from "./topology";

it("matches the method of moments by length and by complex impedance for a homogeneous ring", () => {
  const lengths = solvePreliminaryRing(exampleRingConfiguration, "lengths");
  const impedances = solvePreliminaryRing(exampleRingConfiguration, "impedances");
  expect(lengths.branches.map(branch => branch.preliminaryMva)).toEqual([
    { re: 5.5, im: 2 }, { re: -.5, im: 2 }, { re: -2.5, im: -2 },
  ]);
  lengths.branches.forEach((branch, index) => {
    expect(impedances.branches[index].preliminaryMva.re).toBeCloseTo(branch.preliminaryMva.re, 12);
    expect(impedances.branches[index].preliminaryMva.im).toBeCloseTo(branch.preliminaryMva.im, 12);
  });
  expect(lengths.split).toEqual({ p: ["B2"], q: ["B3"] });
});

it("uses conjugate impedance weights independently of length in a mixed ring", () => {
  const catalogue = { ...exampleRingConfiguration.catalogue, types: [
    ...exampleRingConfiguration.catalogue.types,
    { ...exampleRingConfiguration.catalogue.types[0], id: "mixed", kind: "line" as const, ratedFrequencyHz: 50,
      rOhmPerKm: .36, xOhmPerKm: .11, shunt: { kind: "susceptance" as const, siemensPerKm: 0 } },
  ] };
  const configuration = changePowerNetwork({ ...exampleRingConfiguration, catalogue }, {
    ...exampleRingConfiguration.network,
    elements: exampleRingConfiguration.network.elements.map(branch => branch.id === "L2" ? { ...branch, typeId: "mixed" } : branch),
  });
  expect(() => solvePreliminaryRing(configuration, "lengths")).toThrow("power-ring-inhomogeneous");
  const [first] = solvePreliminaryRing(configuration, "impedances").branches;
  // Independently checked with rectangular complex arithmetic.
  expect(first.preliminaryMva.re).toBeCloseTo(6.0146341463414625, 10);
  expect(first.preliminaryMva.im).toBeCloseTo(1.931707317073171, 10);
});

it("records independent cuts without modifying physical connectivity and rejects an open cycle", () => {
  const cuts = [{ busId: "B2", quantity: "p" }, { busId: "B3", quantity: "q" }] as const;
  const before = solvePreliminaryRing(exampleRingConfiguration, "lengths");
  const after = solvePreliminaryRing(exampleRingConfiguration, "lengths", cuts);
  expect(after.calculationCuts).toEqual(cuts);
  expect(after.branches).toEqual(before.branches);
  expect(createPowerStudy(exampleRingConfiguration.network, cuts).islands[0].topology).toBe("meshed");
  const opened = changePowerNetwork(exampleRingConfiguration, {
    ...exampleRingConfiguration.network,
    elements: exampleRingConfiguration.network.elements.map(branch => branch.id === "L3" ? { ...branch, inService: false } : branch),
  });
  expect(() => solvePreliminaryRing(opened, "lengths", cuts)).toThrow("power-ring-simple-cycle");
});
