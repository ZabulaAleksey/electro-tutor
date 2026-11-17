import { expect, it } from "vitest";
import { reactiveLcMode } from "../circuit/reactive-lc-mode";
import { fosterIIReactance, synthesizeFosterII } from "./reactive-foster-ii";
import { solveCircuit } from "./reactive-two-port";

it("realizes an ideal inductor and capacitor as single shunt branches", () => {
  const l = synthesizeFosterII(solveCircuit({ kind: "l", value: 20 }).impedance);
  const c = synthesizeFosterII(solveCircuit({ kind: "c", value: 50 }).impedance);
  expect(l.terms).toEqual([{ kind: "shunt-l", henry: .02, strength: .05 }]);
  expect(c.terms).toEqual([{ kind: "shunt-c", farad: 50e-6, strength: .05 }]);
  expect(fosterIIReactance(l.terms, 500)).toBeCloseTo(10, 10);
  expect(fosterIIReactance(c.terms, 500)).toBeCloseTo(-40, 10);
});

it("recovers the extreme and finite terms of an independently defined admittance", () => {
  // The inverse impedance is 2q + 3/q + 4q/(q² + 4).
  const z = { numerator: [0n, 4n, 0n, 1n], denominator: [12n, 0n, 15n, 0n, 2n] };
  const network = synthesizeFosterII(z);
  expect(network.terms).toEqual([
    { kind: "shunt-l", henry: 1 / 3000, strength: 3 },
    { kind: "shunt-c", farad: .002, strength: 2 },
    { kind: "series-lc", henry: .00025, farad: .001, omega: 2000, strength: 4 },
  ]);
  for (const omega of [75, 500, 1900, 2100, 8010]) {
    const q = omega / 1000;
    expect(fosterIIReactance(network.terms, omega)).toBeCloseTo(-1 / (2 * q - 3 / q + 4 * q / (4 - q*q)), 10);
  }
});

it("matches nodal reactances of the actual editor bridge using the synthesized parallel branches", () => {
  const bridge = reactiveLcMode.readModel(reactiveLcMode.createDefaultDocument());
  if (bridge.kind !== "finite") throw Error("Expected a bridge impedance");
  const network = synthesizeFosterII(bridge.impedance);
  expect(network.terms.map(term => term.kind)).toEqual(["shunt-l", "series-lc", "series-lc"]);
  expect(network.terms[0]).toMatchObject({ henry: .06 });
  for (const [omega, expected] of [[500, 54.77611940298512], [1000, -16], [1800, -28.34628070311588], [3000, 1.0794602698650753], [10000, 50.51671166558038]]) {
    expect(fosterIIReactance(network.terms, omega)).toBeCloseTo(expected, 8);
  }
  expect(network.error).toBeLessThan(1e-10);
});
