import { expect, it } from "vitest";
import { reactiveLcMode } from "../circuit/reactive-lc-mode";
import { cauerReactance } from "./reactive-cauer-i";
import { cauerIIImpedance, synthesizeCauerII } from "./reactive-cauer-ii";
import { solveCircuit } from "./reactive-two-port";

it("recovers a known series C, shunt L, series C ladder exactly", () => {
  // 2/q + 1/(3/q + 1/(5/q)) = (7q² + 30)/(q³ + 15q).
  const z = { numerator: [30n, 0n, 7n], denominator: [0n, 15n, 0n, 1n] };
  const ladder = synthesizeCauerII(z);
  expect(ladder.elements).toEqual([
    { placement: "series", kind: "c", valueSI: .0005, coefficient: { numerator: 2n, denominator: 1n } },
    { placement: "shunt", kind: "l", valueSI: 1 / 3000, coefficient: { numerator: 3n, denominator: 1n } },
    { placement: "series", kind: "c", valueSI: .0002, coefficient: { numerator: 5n, denominator: 1n } },
  ]);
  expect(cauerIIImpedance(ladder.elements)).toEqual(z);
  for (const omega of [150, 500, 2000, 3000, 9000]) {
    const q = omega / 1000;
    expect(cauerReactance(ladder.elements, omega)).toBeCloseTo(-2/q + 5*q/(15 - q*q), 10);
  }
});

it("starts with the correct element for a simple pole and zero at DC", () => {
  const c = synthesizeCauerII(solveCircuit({ kind: "c", value: 50 }).impedance);
  const l = synthesizeCauerII(solveCircuit({ kind: "l", value: 20 }).impedance);
  expect(c.elements).toEqual([{ placement: "series", kind: "c", valueSI: 50e-6, coefficient: { numerator: 20n, denominator: 1n } }]);
  expect(l.elements).toEqual([{ placement: "shunt", kind: "l", valueSI: .02, coefficient: { numerator: 1n, denominator: 20n } }]);
  expect(cauerReactance(c.elements, 500)).toBeCloseTo(-40);
  expect(cauerReactance(l.elements, 500)).toBeCloseTo(10);
});

it("matches the graph bridge in exact form and by independent nodal samples", () => {
  const bridge = reactiveLcMode.readModel(reactiveLcMode.createDefaultDocument());
  if (bridge.kind !== "finite") throw Error("Expected the bridge impedance");
  const ladder = synthesizeCauerII(bridge.impedance);
  expect(ladder.elements.map(element => element.placement)).toEqual(["shunt", "series", "shunt", "series", "shunt"]);
  expect(ladder.elements[0].coefficient).toEqual({ numerator: 1n, denominator: 60n });
  expect(ladder.elements[1].coefficient).toEqual({ numerator: 1800n, denominator: 49n });
  expect(ladder.impedance).toEqual(bridge.impedance);
  for (const [omega, expected] of [[500, 54.77611940298512], [1000, -16], [1800, -28.34628070311588], [3000, 1.0794602698650753], [10000, 50.51671166558038]]) {
    expect(cauerReactance(ladder.elements, omega)).toBeCloseTo(expected, 8);
  }
});
