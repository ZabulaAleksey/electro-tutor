import { expect, it } from "vitest";
import { reactiveLcMode } from "../circuit/reactive-lc-mode";
import { cauerIImpedance, cauerReactance, synthesizeCauerI } from "./reactive-cauer-i";
import { solveCircuit } from "./reactive-two-port";

it("recovers a known series L, shunt C, series L ladder exactly", () => {
  // 2q + 1/(3q + 1/(5q)) = (30q³ + 7q)/(15q² + 1).
  const impedance = { numerator: [0n, 7n, 0n, 30n], denominator: [1n, 0n, 15n] };
  const ladder = synthesizeCauerI(impedance);
  expect(ladder.elements).toEqual([
    { placement: "series", kind: "l", valueSI: .002, coefficient: { numerator: 2n, denominator: 1n } },
    { placement: "shunt", kind: "c", valueSI: .003, coefficient: { numerator: 3n, denominator: 1n } },
    { placement: "series", kind: "l", valueSI: .005, coefficient: { numerator: 5n, denominator: 1n } },
  ]);
  expect(cauerIImpedance(ladder.elements)).toEqual(impedance);
  for (const omega of [75, 100, 150, 500, 2000]) {
    const q = omega / 1000;
    expect(cauerReactance(ladder.elements, omega)).toBeCloseTo(2*q + 5*q/(1 - 15*q*q), 10);
  }
});

it("starts from admittance when an ideal capacitor has a zero at infinity", () => {
  const c = synthesizeCauerI(solveCircuit({ kind: "c", value: 50 }).impedance);
  const l = synthesizeCauerI(solveCircuit({ kind: "l", value: 20 }).impedance);
  expect(c.elements).toEqual([{ placement: "shunt", kind: "c", valueSI: 50e-6, coefficient: { numerator: 1n, denominator: 20n } }]);
  expect(l.elements).toEqual([{ placement: "series", kind: "l", valueSI: .02, coefficient: { numerator: 20n, denominator: 1n } }]);
  expect(cauerReactance(c.elements, 500)).toBeCloseTo(-40);
  expect(cauerReactance(l.elements, 500)).toBeCloseTo(10);
});

it("reconstructs the editor bridge coefficients and independent nodal values", () => {
  const result = reactiveLcMode.readModel(reactiveLcMode.createDefaultDocument());
  if (result.kind !== "finite") throw Error("Expected a finite LC bridge");
  const ladder = synthesizeCauerI(result.impedance);
  expect(ladder.elements.map(element => element.placement)).toEqual(["series", "shunt", "series", "shunt", "series"]);
  expect(ladder.elements[0].coefficient).toEqual({ numerator: 60n, denominator: 11n });
  expect(ladder.elements[1].coefficient).toEqual({ numerator: 121n, denominator: 4820n });
  expect(ladder.impedance).toEqual(result.impedance);
  for (const [omega, expected] of [[500, 54.77611940298512], [1000, -16], [1800, -28.34628070311588], [3000, 1.0794602698650753], [10000, 50.51671166558038]]) {
    expect(cauerReactance(ladder.elements, omega)).toBeCloseTo(expected, 8);
  }
});

it("rejects a non-passive extraction or a nonpositive frequency", () => {
  expect(() => synthesizeCauerI({ numerator: [0n, -1n], denominator: [1n] })).toThrow("cauer-component-range");
  expect(() => cauerReactance([], 0)).toThrow("invalid-cauer-frequency");
});
