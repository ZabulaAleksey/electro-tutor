import { expect, it } from "vitest";
import { fosterIReactance, synthesizeFosterI } from "./reactive-foster-i";
import { reactance, solveCircuit } from "./reactive-two-port";
import { reactiveLcMode } from "../circuit/reactive-lc-mode";

it("recovers the original ideal inductor and capacitor independently", () => {
  const inductive = synthesizeFosterI(solveCircuit({ kind: "l", value: 20 }).impedance);
  const capacitive = synthesizeFosterI(solveCircuit({ kind: "c", value: 50 }).impedance);
  expect(inductive.terms).toEqual([{ kind: "series-l", henry: .02, strength: 20 }]);
  expect(capacitive.terms).toEqual([{ kind: "series-c", farad: 50e-6, strength: 20 }]);
  expect(fosterIReactance(inductive.terms, 500)).toBeCloseTo(10);
  expect(fosterIReactance(capacitive.terms, 500)).toBeCloseTo(-40);
});

it("recovers the DC pole, finite pole and inductive term of a physical test function", () => {
  // 2q + 3/q + 4q/(q² + 4) = (2q⁴ + 15q² + 12)/(q³ + 4q).
  const original = { numerator: [12n, 0n, 15n, 0n, 2n], denominator: [0n, 4n, 0n, 1n] };
  const realized = synthesizeFosterI(original);
  expect(realized.terms).toEqual([
    { kind: "series-c", farad: 1 / 3000, strength: 3 },
    { kind: "series-l", henry: .002, strength: 2 },
    { kind: "parallel-lc", henry: .001, farad: .00025, omega: 2000, strength: 4 },
  ]);
  for (const omega of [75, 500, 1900, 2100, 8010]) {
    const q = omega / 1000;
    expect(fosterIReactance(realized.terms, omega)).toBeCloseTo(2 * q - 3 / q + 4 * q / (4 - q * q), 9);
  }
});

it("rebuilds the actual editor bridge from positive components and matches independent nodal values", () => {
  const result = reactiveLcMode.readModel(reactiveLcMode.createDefaultDocument());
  if (result.kind !== "finite") throw Error("Expected a bridge impedance");
  const realized = synthesizeFosterI(result.impedance);
  expect(realized.terms.map(term => term.kind)).toEqual(["series-l", "parallel-lc", "parallel-lc"]);
  const [last] = realized.terms.slice(-1);
  if (last.kind !== "parallel-lc") throw Error("Expected a tank");
  expect(last.omega).toBeCloseTo(1371.1689023957429, 9);
  expect(last.henry).toBeCloseTo(.009638047512597498, 12);
  expect(last.farad).toBeCloseTo(55.186014025966725e-6, 14);
  for (const [omega, expected] of [[500, 54.77611940298512], [1000, -16], [1800, -28.34628070311588], [3000, 1.0794602698650753]]) {
    expect(fosterIReactance(realized.terms, omega)).toBeCloseTo(expected, 8);
    expect(reactance(result.impedance, omega)).toBeCloseTo(expected, 8);
  }
  expect(realized.error).toBeLessThan(1e-10);
});

it("rejects a nonphysical residue and nonpositive check frequencies", () => {
  expect(() => synthesizeFosterI({ numerator: [0n, -1n], denominator: [1n, 0n, 1n] })).toThrow("foster-synthesis-range");
  expect(() => fosterIReactance([], 0)).toThrow("invalid-foster-frequency");
});
